/// <reference path="../typings/main.d.ts"/>
'use strict';

import events = require('events');
import q = require('q');
import http = require('http');
import clone = require('clone');

//const StateMachine = require('finity');
//import StateMachine from 'finity';
const StateMachine = require('finity').default;

const uuid4 = require('uuid4');

import {
    ILogger,
    ILoggerFactory,
    ConsoleLogger,
    NullLogger,
    NullLoggerFactory,
    ContextPrefixedLogger,
    ContextPrefixedLoggerFactory
} from 'logging-interfaces';

import {
    IAMEWebserviceClient,
    AMEWebserviceClient,
    IAMEWebserviceClientConfig,
    IAMEJobSubmission,
    AMEJobStatus,
    AMESubmitResult,
    AMEServerStatus,
    IAMEJobStatusResponse,
    IAMESubmitJobResponse,
    IAMEServerStatusResponse,
    IAMEJobHistoryResponse,
    IAMEHistoricJob
} from './ame-webservice-client';

export interface IAdobeMediaEncoderOptions extends IAMEWebserviceClientConfig
{
    enableNotificationsServer?: boolean;
    notificationsPort?: number;
    logger?: ILogger;
    loggerFactory?: ILoggerFactory;
}

export enum AMEQueuedJobStatus
{
    Pending = 0,
    Submitting = 1,
    Encoding = 2,
    Aborting = 3,
    Aborted = 4,
    Failed = 5,
    Succeeded = 6
}

export class AMEQueuedJob extends events.EventEmitter
{
    private _ame: AdobeMediaEncoder;
    private _job: IAMEJobSubmission;
    private _states: any;

    private _id: string;

    private _status: AMEQueuedJobStatus = AMEQueuedJobStatus.Pending;
    private _statusDetail: string = "";

    private _errorStateTimeoutSeconds: number = 15;
    
    private _submitRetries: number = 10;
    private _submitRetryDelaySeconds: number = 1;
    
    private _abortRetries: number = 3;
    private _abortRetryDelaySeconds: number = 1;
    
    private _aborted: boolean = false;

    private _submitStatus: IAMESubmitJobResponse;
    private _mostRecentStatus: IAMEJobStatusResponse;
    private _waitErrorStateSince: number = null;

    private _log: ILogger;

    private _isSubmitted: boolean = false;
    private _isAborted: boolean = false;

    get job(): IAMEJobSubmission
    {
        return this._job;
    }

    get status(): AMEQueuedJobStatus
    {
        return this._status;
    }

    get statusText(): string
    {
        return AMEQueuedJobStatus[this._status];
    }

    get statusDetail(): string
    {
        return this._statusDetail;
    }

    get lastStatusResponse(): IAMEJobStatusResponse
    {
        return this._mostRecentStatus;
        //return (this._mostRecentStatus == null) ? this._submitStatus : this._mostRecentStatus;
    }

    get progress(): number
    {
        let progress: number = 0;
        if (this._mostRecentStatus != null)
            progress = (this._mostRecentStatus.jobStatus == AMEJobStatus.Success) ? 100 : this._mostRecentStatus.jobProgress;
        return progress;
    }

    constructor(job: IAMEJobSubmission, logFactory: ILoggerFactory, ame: AdobeMediaEncoder, id?: string)
    {
        super();

        this._id = (id == undefined) ? uuid4() : id;
        this._log = logFactory.getLogger(this._id);

        this._ame = ame;
        this._job = job;

        this._states = StateMachine

            .configure()

                .initialState('pending')

                    .on('submit').transitionTo('submit')
                    .on('abort').transitionTo('end')

                .state('submit')

                    .onEnter(() => this._submit())
                    .on('submit').selfTransition() // busy/retry
                    .on('failed').transitionTo('end')
                    .on('rejected').transitionTo('end')
                    .on('abort').transitionTo('abort')
                    .on('accepted').transitionTo('wait')

                .state('wait')

                    .onEnter(() => this._waitForJobCompletion())
                    .on('wait').selfTransition()
                    .on('abort').transitionTo('abort')
                    .on('end').transitionTo('end')
                    .on('end-check-history').transitionTo('end-check-history')

                .state('abort')

                    .onEnter(() => this._abortSubmitted())
                    .on('abort').selfTransition() // retry
                    .on('end').transitionTo('end')
                    .on('end-check-history').transitionTo('end-check-history')

                .state('end-check-history')

                    .onEnter(() => this._checkHistoryForStatus())
                    .on('abort').transitionTo('end') // just because the SM library doesn't support .ignore() yet
                    .on('end').transitionTo('end')

                .state('end')

                    .onEnter(() => this._ended())

                .global()

                    .onStateEnter((state: string) => this._log.info(`Entering state '${state}'`))
                    .onUnhandledEvent((event: string, state: string) => console.log(`Unhandled event '${event}' in state '${state}.'`))

            .start();
    }

    submit(): void
    {
        if (!this._isSubmitted)
            this._states.handle('submit');

        this._isSubmitted = true;
    }

    abort(): void
    {
        if (!this._isAborted)
            this._states.handle('abort');

        this._isAborted = true;
    }

    private _lastEmitStatsResponse: IAMEJobStatusResponse = null;

    private _lastEmitStatus: AMEQueuedJobStatus = null;

    private _emitProgress(forceEmit: boolean = false): void
    {
        const cur = this._mostRecentStatus || this._submitStatus;
        const last = this._lastEmitStatsResponse;

        if (forceEmit || last == null || cur == null || (last.jobStatus != cur.jobStatus) || (last.jobProgress != cur.jobProgress) || (this._status != this._lastEmitStatus))
            this._safeEmit('progress', this);

        this._lastEmitStatsResponse = cur;
        this._lastEmitStatus = this._status;
    }

    private _safeEmit(eventName: string, eventArgs: any = undefined, dispatchViaImmediate: boolean = true)
    {
        const dispatch = () =>
        {
            try
            {
                this.emit(eventName, eventArgs);
            }
            catch (err)
            {
            }
        };

        if (dispatchViaImmediate === false) dispatch();
        else setImmediate(dispatch);
    }

    private _retrySubmit(wasBusy: boolean, failAction: string = 'failed')
    {
        this._status = AMEQueuedJobStatus.Pending;

        if (wasBusy || this._submitRetries-- > 0)
        {
            this._statusDetail = `Retrying submit to AME in ${this._submitRetryDelaySeconds}s (attempts left: ${this._submitRetries})`;
            this._log.info(`Retrying submit to AME in ${this._submitRetryDelaySeconds}s (attempts left: ${this._submitRetries})`);
            this._emitProgress(true);
            
            setTimeout(() => this._states.handle('submit'), 1000 * this._submitRetryDelaySeconds);
        }
        else
        {
            this._log.info("Exceeded submit retry limit, failing job..")
            this._statusDetail = "Exceeded submit retry limit, failing job..";
            this._emitProgress(true);

            this._states.handle(failAction);
        }
    }

    private _submit()
    {
        const [ log, ame ] = [ this._log, this._ame ];

        log.info('Submitting job to AME..');
        this._status = AMEQueuedJobStatus.Submitting;
        this._statusDetail = `(Attempts left: ${this._submitRetries})`;
        this._emitProgress();

        ame.client.submitJob(this._job).then(
            (status: IAMESubmitJobResponse) =>
            {
                this._submitStatus = status;

                log.info(`AME responded with submit status '${status.submitResultText}'`);

                switch (status.submitResult)
                {
                    case AMESubmitResult.Accepted:

                        log.info("AME accepted our job!");
                        this._states.handle('accepted');
                        this._emitProgress();
                        break;

                    case AMESubmitResult.BadSyntax:
                    
                        log.info("AME rejected our job claiming 'bad syntax' - can't recover!");
                        this._states.handle('rejected');
                        this._emitProgress();
                        break;

                    case AMESubmitResult.Rejected:

                        log.info("AME rejected our job - will retry..");
                        // We could just do this._stats.handle('rejected') but sometimes AME will
                        // temporarily just fail jobs, probably because it is low on resources.
                        //
                        // Console output will be:
                        //
                        // Job request received.
                        //
                        // Source path: Z:\temp\render_jobs\57ce729f56222a640a89fca6\e10c9484-def6-47cf-a38d-e5fa5065e63f.mov
                        // Output path: Z:\temp\render_jobs\57ce729f56222a640a89fca6\ITN_OYML050_030.mxf
                        // Preset path: C:\Program Files\Adobe\Adobe Media Encoder CC 2015.3\MediaIO\systempresets\58444341_4D584658\XDCAMHD 50 PAL 50i.epr
                        //
                        //
                        // Creating encoder.
                        //
                        // Creating Encoder - Timeout while creating encoder group
                        this._retrySubmit(false, 'rejected');
                        this._emitProgress();
                        break;


                    case AMESubmitResult.Busy:

                        log.info("AME is busy processing some job..");
                        this._retrySubmit(true);
                        this._emitProgress();
                        break;

                    case AMESubmitResult.NoServer:

                        log.info("AME is stopped..");
                        this._retrySubmit(true);
                        this._emitProgress();
                        break;

                    case AMESubmitResult.Unknown:
                    default:

                        log.error(`AME responded with unknown status '${status.submitResultText}'`)
                        this._retrySubmit(false);
                        this._emitProgress();
                        return;
                }
            },
            (error: any) =>
            {
                log.error(`Error submitting job to AME: ${error.message}`);
                this._emitProgress();
                this._retrySubmit(false);
            }
        );
    }

    private _retryWait(isErrorState: boolean = false)
    {
        if (isErrorState)
        {
            if (this._waitErrorStateSince == null) this._waitErrorStateSince = Date.now();
            if ((Date.now() - this._waitErrorStateSince) / 1000 > this._errorStateTimeoutSeconds)
            {
                this._log.error('AME has been in an error state for too long - assuming that job has failed');

                // make a fake error state for the 'ended' state to pick up
                this._copySubmitStatus('AME has been in an error state for too long - assuming that job has failed')
                this._states.handle('end-check-history');
                return;
            }
        }
        setTimeout(() => this._states.handle('wait'), 1000);
    }

    private _waitForJobCompletion()
    {
        const [ log, ame ] = [ this._log, this._ame ];

        this._status = AMEQueuedJobStatus.Encoding;
        this._statusDetail = "";

        log.info("Querying AME job status..");
        ame.client.getJobStatus().then(
            (status: IAMEJobStatusResponse) =>
            {
                log.info(`Queried AME job status (${status.jobStatusText})`);

                if (status.jobId != this._submitStatus.jobId)
                {
                    // the ended state must check the history
                    log.warn(`AME is reporting a different current job than ours - probably finished processing it, must check server history for final result`);
                    this._states.handle('end-check-history');
                    return;
                }

                this._mostRecentStatus = status;
                switch (status.jobStatus)
                {
                    case AMEJobStatus.Queued:
                    case AMEJobStatus.Encoding:
                    case AMEJobStatus.Paused:

                        this._retryWait();
                        break;

                    case AMEJobStatus.NotFound:

                        log.error(`AME reports no job found (server stopped?)`);
                        this._states.handle('end-check-history');
                        break;

                    case AMEJobStatus.Stopped:

                        log.error(`AME reports our job as stopped (aborted)`);
                        this._status = AMEQueuedJobStatus.Aborted;
                        this._statusDetail = `AME reports our job as stopped (aborted)`;
                        this._states.handle('end');
                        break;

                    case AMEJobStatus.Failed:

                        this._statusDetail = `AME reports our job as failed`;
                        log.error(`AME reports our job as failed`);
                        //this._status = AMEQueuedJobStatus.Failed; // let 'ended' figure this out
                        this._states.handle('end');
                        break;

                    case AMEJobStatus.Success:

                        log.info(`AME reports our job as successfully completed!`);
                        this._status = AMEQueuedJobStatus.Succeeded;
                        this._statusDetail = `AME reports our job as successfully completed!`;
                        this._states.handle('end');
                        break;

                    case AMEJobStatus.Unknown:
                    default:

                        log.warn(`AME reports unknown job status '${status.jobStatus}'`);
                        this._retryWait(true);
                        break;
                }
                this._emitProgress();
            },
            (error: any) =>
            {
                log.warn(`AME is not responding`);
                this._retryWait(true);
                this._emitProgress();
            }
        )
    }

    private _copySubmitStatus(details: string = undefined, status: AMEJobStatus = AMEJobStatus.Failed)
    {
        // only copy if a recent status isn't set
        if (this._mostRecentStatus == null)
            this._mostRecentStatus = clone(this._submitStatus);
        
        // if the submit status was null, then fake one.. 
        if (this._mostRecentStatus == null)
            this._mostRecentStatus = <IAMEJobStatusResponse>{
                serverStatus: AMEServerStatus.Unknown,
                serverStatusText: AMEServerStatus[AMEServerStatus.Unknown],  
                jobId: '',
                jobStatus: AMEJobStatus.Unknown,
                jobStatusText: AMEQueuedJobStatus[AMEJobStatus.Unknown],
                jobProgress: undefined,                                
                details: '(Job was never submitted to the server)'
            }

        // only update the status/details if the job didn't already complete by itself
        if (this._mostRecentStatus.jobStatus != AMEJobStatus.Success
            && this._mostRecentStatus.jobStatus != AMEJobStatus.Failed
            && this._mostRecentStatus.jobStatus != AMEJobStatus.Stopped)
        {
            this._mostRecentStatus.serverStatus = AMEServerStatus.Unknown;
            this._mostRecentStatus.serverStatusText = AMEServerStatus[AMEServerStatus.Unknown];

            this._mostRecentStatus.jobStatus = status;
            this._mostRecentStatus.jobStatusText = AMEJobStatus[status];

            if (details != undefined) this._mostRecentStatus.details = details;
        }
    }

    private _abortSubmitted()
    {
        const [ log, ame ] = [ this._log, this._ame ];

        this._status = AMEQueuedJobStatus.Aborting;
        this._statusDetail = `Attempting to abort submitted job in AME.. (attempts left: ${this._abortRetries})`;
        this._emitProgress(true);

        // check that it's our job still being processed..
        log.info("Getting AME job status before aborting job..");
        ame.client.getJobStatus().then(
            (status: IAMEJobStatusResponse) =>
            {
                if (status.jobId == this._submitStatus.jobId)
                {
                    log.info("Telling AME to abort the current job..");
                    ame.client.abortJob().then(
                        () =>
                        {
                            log.info("AME reports job successfully aborted!");
                            this._copySubmitStatus("Aborted upon request");

                            this._status = AMEQueuedJobStatus.Aborted;
                            this._statusDetail = "AME reports job successfully aborted!";
                            this._emitProgress();
                        },
                        (error: any) =>
                        {
                            this._statusDetail = `Error while aborting AME job: ${error.message}`;
                            log.error(this._statusDetail);                            
                            this._emitProgress(true);
                            
                            this._retryAbortSubmitted();
                        }
                    )
                }
                else
                {
                    log.error("AME returns different current job than ours - must check history for final status");
                    this._states.handle('end-check-history');
                    this._emitProgress();
                }
            },
            (error: any) =>
            {
                log.error(`Error while requesting AME status before aborting job: ${error.message}`);
                this._retryAbortSubmitted();
                this._emitProgress();
            }
        );
    }

    private _retryAbortSubmitted()
    {
        if (this._abortRetries-- > 0)
        {
            this._statusDetail = `Retrying abort in ${this._abortRetryDelaySeconds}s (attempts left: ${this._abortRetries})`;
            this._log.info(this._statusDetail);
            this._emitProgress(true);
            
            setTimeout(() => this._states.handle('abort'), 1000 * this._abortRetryDelaySeconds)
        }
        else
        {
            this._statusDetail = `Number of retry attempts saturated - ending job..`;            
            this._log.info(this._statusDetail);            
            this._emitProgress(true);
            
            this._states.handle('end-check-history');
        }
    }

    private _checkHistoryForStatus()
    {
        const [ log, ame ] = [ this._log, this._ame ];

        // if we already have a status and it says something about a final
        // status, then there's no need to check the history..
        if (this._mostRecentStatus != null
            && (this._mostRecentStatus.jobStatus == AMEJobStatus.Success
                || this._mostRecentStatus.jobStatus == AMEJobStatus.Failed)
            )
        {
            this._states.handle('end');
            return;
        }

        log.info("Getting AME job history..");
        ame.client.getJobHistory().then(
            (history: IAMEJobHistoryResponse) =>
            {
                log.info("Got AME job history, trying to locate our job..")
                let found: boolean = false;
                if (history.historicJobs != null)
                    history.historicJobs.every((h) =>
                    {
                        if (h.jobId == this._submitStatus.jobId)
                        {
                            log.info("Found our job in the AME history!", h)
                            this._mostRecentStatus = <IAMEJobStatusResponse>{
                                serverStatus: history.serverStatus,
                                serverStatusText: history.serverStatusText,
                                jobId: h.jobId,
                                jobStatus: h.jobStatus,
                                jobStatusText: h.jobStatusText,
                                jobProgress: h.jobProgress, // usually not be set
                                details: h.details
                            };
                            found = true;
                            return false;
                        }
                        return true;
                    });
                if (!found) log.error("Could not find our job in the AME history!");

                this._states.handle("end");
            },
            (error: any) =>
            {
                log.error(`Unable to get AME job history: ${error.message}`);

                // make a fake error state for the 'ended' state to pick up
                this._copySubmitStatus(`Unable to get AME job history: ${error.message}`);                
                this._states.handle("end");
            }
        )
    }

    private _ended()
    {
        const [ log, ame ] = [ this._log, this._ame ];

        const submitStatus = this._submitStatus;
        const lastStatus = this._mostRecentStatus;

        console.log(`ended, status=${this._status}`);

        if (this._status != AMEQueuedJobStatus.Aborted
            && this._status != AMEQueuedJobStatus.Failed
            && this._status != AMEQueuedJobStatus.Succeeded)
        {
            this._status = AMEQueuedJobStatus.Failed;
            this._copySubmitStatus();
        }

        this._emitProgress();

        this._safeEmit('ended', this);
    }
}

export class AdobeMediaEncoder extends events.EventEmitter
{
    private _options: IAdobeMediaEncoderOptions;

    private _client: AMEWebserviceClient;
    private _http: http.Server = null;

    private _log: ILogger = null;
    private _logFactory: ILoggerFactory;

    get client(): AMEWebserviceClient
    {
        return this._client;
    }

    constructor(options: IAdobeMediaEncoderOptions)
    {
        super();

        if (options.logger == null && options.loggerFactory == null)
            this._logFactory = new NullLoggerFactory();
        else if (options.logger != null && options.loggerFactory == null)
        {
            this._log = options.logger;
            this._logFactory = new ContextPrefixedLoggerFactory(options.logger);
        }
        else // both are set
        {
            this._log = options.logger;
            this._logFactory = options.loggerFactory;
        }

        if (this._log == null) this._log = this._logFactory.getLogger();

        this._options = options;
        this._client = new AMEWebserviceClient(options);
    }

    start(): q.Promise<void>
    {
        const d = q.defer<void>();
        q.all([ this._setupNotificationsServer() ]).then(
            (promises: any) =>
            {
                //setImmediate(this._processSubmitQueue());
                this._setupQueue();
                d.resolve();
            },
            (err: any) => d.reject(err)
        );
        return d.promise;
    }

    _queueStates: any;
    _queue: AMEQueuedJob[] = [];
    _current: AMEQueuedJob;

    private _setupQueue()
    {
        try {

        this._queueStates = StateMachine

            .configure()

                .initialState('idle')

                    .onEnter(() => { if (this._queue.length > 0) this._queueStates.handle('enqueue'); })
                    .on('enqueue').transitionTo('process')

                .state('process')

                    .onEnter(() => this._processNextQueuedJob())
                    .on('idle').transitionTo('idle')

                .global()
                    .onStateEnter((state: string) => this._log.info(`QUEUE: Entering state ${state}`))
                    .onUnhandledEvent((event: string, state: string) => this._log.info(`QUEUE: Unhandled event '${event}' in state '${state}.'`))

            .start();

        }
        catch (err)
        {
            console.error(`${err.message} at\n${err.stack}`);
        }
    }

    private _processNextQueuedJob()
    {
        this._current = this._queue.shift();
        this._current.once('ended', () => { this._queueStates.handle('idle'); })
        this._current.submit();
    }

    public enqueueJob(job: IAMEJobSubmission, id?: string): AMEQueuedJob
    {
        const qj = new AMEQueuedJob(job, this._logFactory, this, id);
        this._queue.push(qj);
        this._queueStates.handle('enqueue');
        return qj;
    }

    private _setupNotificationsServer(): q.Promise<void>
    {
        const d = q.defer<void>();
        if (this._options.enableNotificationsServer === true)
        {
            var server = this._http = http.createServer();

            server.on('request', (req: any, res: any) =>
            {
                //console.dir({ url: req.url, method: req.method, headers: req.headers });

                var body = "";
                req.on('data', (chunk: any) => { body += chunk; })
                req.on('end', () =>
                {
                    // AME just expects a HTTP 200 status back
                    //res.writeHead(200, { 'Content-Type': 'application/xml' });
                    res.writeHead(200);
                    res.end("");
                })
            });

            server.once('error', (err: any) =>
            {
                d.reject(err);
            });

            server.once('listening', () =>
            {
                d.resolve();
            });

            server.listen(this._options.notificationsPort)
        }
        else
        {
            d.resolve();
            //d.reject(new Error("Not configured to use a notification server"));
        }

        return d.promise;
    }

    private _stopNotificationsServer(): q.Promise<void>
    {
        const d = q.defer<void>();
        if (this._http != null)
        {
            this._http.close();
            this._http = null;
        }
        return d.promise;
    }
}
