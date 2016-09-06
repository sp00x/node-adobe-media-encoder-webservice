/// <reference path="../typings/main.d.ts" />
import events = require('events');
import q = require('q');
import { ILogger, ILoggerFactory } from 'logging-interfaces';
import { AMEWebserviceClient, IAMEWebserviceClientConfig, IAMEJobSubmission, IAMEJobStatusResponse } from './ame-webservice-client';
export interface IAdobeMediaEncoderOptions extends IAMEWebserviceClientConfig {
    enableNotificationsServer?: boolean;
    notificationsPort?: number;
    logger?: ILogger;
    loggerFactory?: ILoggerFactory;
}
export declare enum AMEQueuedJobStatus {
    Pending = 0,
    Submitting = 1,
    Encoding = 2,
    Aborting = 3,
    Aborted = 4,
    Failed = 5,
    Succeeded = 6,
}
export declare class AMEQueuedJob extends events.EventEmitter {
    private _ame;
    private _job;
    private _states;
    private _id;
    private _status;
    private _statusDetail;
    private _errorStateTimeoutSeconds;
    private _submitRetries;
    private _submitRetryDelaySeconds;
    private _abortRetries;
    private _abortRetryDelaySeconds;
    private _aborted;
    private _submitStatus;
    private _mostRecentStatus;
    private _waitErrorStateSince;
    private _log;
    private _isSubmitted;
    private _isAborted;
    job: IAMEJobSubmission;
    status: AMEQueuedJobStatus;
    statusText: string;
    statusDetail: string;
    lastStatusResponse: IAMEJobStatusResponse;
    progress: number;
    constructor(job: IAMEJobSubmission, logFactory: ILoggerFactory, ame: AdobeMediaEncoder, id?: string);
    submit(): void;
    abort(): void;
    private _lastEmitStatsResponse;
    private _lastEmitStatus;
    private _emitProgress(forceEmit?);
    private _safeEmit(eventName, eventArgs?, dispatchViaImmediate?);
    private _retrySubmit(wasBusy, failAction?);
    private _submit();
    private _retryWait(isErrorState?);
    private _waitForJobCompletion();
    private _copySubmitStatus(details?, status?);
    private _abortSubmitted();
    private _retryAbortSubmitted();
    private _checkHistoryForStatus();
    private _ended();
}
export declare class AdobeMediaEncoder extends events.EventEmitter {
    private _options;
    private _client;
    private _http;
    private _log;
    private _logFactory;
    client: AMEWebserviceClient;
    constructor(options: IAdobeMediaEncoderOptions);
    start(): q.Promise<void>;
    _queueStates: any;
    _queue: AMEQueuedJob[];
    _current: AMEQueuedJob;
    private _setupQueue();
    private _processNextQueuedJob();
    enqueueJob(job: IAMEJobSubmission, id?: string): AMEQueuedJob;
    private _setupNotificationsServer();
    private _stopNotificationsServer();
}
