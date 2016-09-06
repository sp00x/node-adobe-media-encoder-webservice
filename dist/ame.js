'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var events = require('events');
var q = require('q');
var http = require('http');
var clone = require('clone');
var StateMachine = require('finity').default;
var uuid4 = require('uuid4');
var logging_interfaces_1 = require('logging-interfaces');
var ame_webservice_client_1 = require('./ame-webservice-client');
(function (AMEQueuedJobStatus) {
    AMEQueuedJobStatus[AMEQueuedJobStatus["Pending"] = 0] = "Pending";
    AMEQueuedJobStatus[AMEQueuedJobStatus["Submitting"] = 1] = "Submitting";
    AMEQueuedJobStatus[AMEQueuedJobStatus["Encoding"] = 2] = "Encoding";
    AMEQueuedJobStatus[AMEQueuedJobStatus["Aborting"] = 3] = "Aborting";
    AMEQueuedJobStatus[AMEQueuedJobStatus["Aborted"] = 4] = "Aborted";
    AMEQueuedJobStatus[AMEQueuedJobStatus["Failed"] = 5] = "Failed";
    AMEQueuedJobStatus[AMEQueuedJobStatus["Succeeded"] = 6] = "Succeeded";
})(exports.AMEQueuedJobStatus || (exports.AMEQueuedJobStatus = {}));
var AMEQueuedJobStatus = exports.AMEQueuedJobStatus;
var AMEQueuedJob = (function (_super) {
    __extends(AMEQueuedJob, _super);
    function AMEQueuedJob(job, logFactory, ame, id) {
        var _this = this;
        _super.call(this);
        this._status = AMEQueuedJobStatus.Pending;
        this._statusDetail = "";
        this._errorStateTimeoutSeconds = 15;
        this._submitRetries = 10;
        this._submitRetryDelaySeconds = 1;
        this._abortRetries = 3;
        this._abortRetryDelaySeconds = 1;
        this._aborted = false;
        this._waitErrorStateSince = null;
        this._isSubmitted = false;
        this._isAborted = false;
        this._lastEmitStatsResponse = null;
        this._lastEmitStatus = null;
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
            .onEnter(function () { return _this._submit(); })
            .on('submit').selfTransition()
            .on('failed').transitionTo('end')
            .on('rejected').transitionTo('end')
            .on('abort').transitionTo('abort')
            .on('accepted').transitionTo('wait')
            .state('wait')
            .onEnter(function () { return _this._waitForJobCompletion(); })
            .on('wait').selfTransition()
            .on('abort').transitionTo('abort')
            .on('end').transitionTo('end')
            .on('end-check-history').transitionTo('end-check-history')
            .state('abort')
            .onEnter(function () { return _this._abortSubmitted(); })
            .on('abort').selfTransition()
            .on('end').transitionTo('end')
            .on('end-check-history').transitionTo('end-check-history')
            .state('end-check-history')
            .onEnter(function () { return _this._checkHistoryForStatus(); })
            .on('abort').transitionTo('end')
            .on('end').transitionTo('end')
            .state('end')
            .onEnter(function () { return _this._ended(); })
            .global()
            .onStateEnter(function (state) { return _this._log.info("Entering state '" + state + "'"); })
            .onUnhandledEvent(function (event, state) { return console.log("Unhandled event '" + event + "' in state '" + state + ".'"); })
            .start();
    }
    Object.defineProperty(AMEQueuedJob.prototype, "job", {
        get: function () {
            return this._job;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AMEQueuedJob.prototype, "status", {
        get: function () {
            return this._status;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AMEQueuedJob.prototype, "statusText", {
        get: function () {
            return AMEQueuedJobStatus[this._status];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AMEQueuedJob.prototype, "statusDetail", {
        get: function () {
            return this._statusDetail;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AMEQueuedJob.prototype, "lastStatusResponse", {
        get: function () {
            return this._mostRecentStatus;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AMEQueuedJob.prototype, "progress", {
        get: function () {
            var progress = 0;
            if (this._mostRecentStatus != null)
                progress = (this._mostRecentStatus.jobStatus == ame_webservice_client_1.AMEJobStatus.Success) ? 100 : this._mostRecentStatus.jobProgress;
            return progress;
        },
        enumerable: true,
        configurable: true
    });
    AMEQueuedJob.prototype.submit = function () {
        if (!this._isSubmitted)
            this._states.handle('submit');
        this._isSubmitted = true;
    };
    AMEQueuedJob.prototype.abort = function () {
        if (!this._isAborted)
            this._states.handle('abort');
        this._isAborted = true;
    };
    AMEQueuedJob.prototype._emitProgress = function (forceEmit) {
        if (forceEmit === void 0) { forceEmit = false; }
        var cur = this._mostRecentStatus || this._submitStatus;
        var last = this._lastEmitStatsResponse;
        if (forceEmit || last == null || cur == null || (last.jobStatus != cur.jobStatus) || (last.jobProgress != cur.jobProgress) || (this._status != this._lastEmitStatus))
            this._safeEmit('progress', this);
        this._lastEmitStatsResponse = cur;
        this._lastEmitStatus = this._status;
    };
    AMEQueuedJob.prototype._safeEmit = function (eventName, eventArgs, dispatchViaImmediate) {
        var _this = this;
        if (eventArgs === void 0) { eventArgs = undefined; }
        if (dispatchViaImmediate === void 0) { dispatchViaImmediate = true; }
        var dispatch = function () {
            try {
                _this.emit(eventName, eventArgs);
            }
            catch (err) {
            }
        };
        if (dispatchViaImmediate === false)
            dispatch();
        else
            setImmediate(dispatch);
    };
    AMEQueuedJob.prototype._retrySubmit = function (wasBusy, failAction) {
        var _this = this;
        if (failAction === void 0) { failAction = 'failed'; }
        this._status = AMEQueuedJobStatus.Pending;
        if (wasBusy || this._submitRetries-- > 0) {
            this._statusDetail = "Retrying submit to AME in " + this._submitRetryDelaySeconds + "s (attempts left: " + this._submitRetries + ")";
            this._log.info("Retrying submit to AME in " + this._submitRetryDelaySeconds + "s (attempts left: " + this._submitRetries + ")");
            this._emitProgress(true);
            setTimeout(function () { return _this._states.handle('submit'); }, 1000 * this._submitRetryDelaySeconds);
        }
        else {
            this._log.info("Exceeded submit retry limit, failing job..");
            this._statusDetail = "Exceeded submit retry limit, failing job..";
            this._emitProgress(true);
            this._states.handle(failAction);
        }
    };
    AMEQueuedJob.prototype._submit = function () {
        var _this = this;
        var _a = [this._log, this._ame], log = _a[0], ame = _a[1];
        log.info('Submitting job to AME..');
        this._status = AMEQueuedJobStatus.Submitting;
        this._statusDetail = "(Attempts left: " + this._submitRetries + ")";
        this._emitProgress();
        ame.client.submitJob(this._job).then(function (status) {
            _this._submitStatus = status;
            log.info("AME responded with submit status '" + status.submitResultText + "'");
            switch (status.submitResult) {
                case ame_webservice_client_1.AMESubmitResult.Accepted:
                    log.info("AME accepted our job!");
                    _this._states.handle('accepted');
                    _this._emitProgress();
                    break;
                case ame_webservice_client_1.AMESubmitResult.BadSyntax:
                    log.info("AME rejected our job claiming 'bad syntax' - can't recover!");
                    _this._states.handle('rejected');
                    _this._emitProgress();
                    break;
                case ame_webservice_client_1.AMESubmitResult.Rejected:
                    log.info("AME rejected our job - will retry..");
                    _this._retrySubmit(false, 'rejected');
                    _this._emitProgress();
                    break;
                case ame_webservice_client_1.AMESubmitResult.Busy:
                    log.info("AME is busy processing some job..");
                    _this._retrySubmit(true);
                    _this._emitProgress();
                    break;
                case ame_webservice_client_1.AMESubmitResult.NoServer:
                    log.info("AME is stopped..");
                    _this._retrySubmit(true);
                    _this._emitProgress();
                    break;
                case ame_webservice_client_1.AMESubmitResult.Unknown:
                default:
                    log.error("AME responded with unknown status '" + status.submitResultText + "'");
                    _this._retrySubmit(false);
                    _this._emitProgress();
                    return;
            }
        }, function (error) {
            log.error("Error submitting job to AME: " + error.message);
            _this._emitProgress();
            _this._retrySubmit(false);
        });
    };
    AMEQueuedJob.prototype._retryWait = function (isErrorState) {
        var _this = this;
        if (isErrorState === void 0) { isErrorState = false; }
        if (isErrorState) {
            if (this._waitErrorStateSince == null)
                this._waitErrorStateSince = Date.now();
            if ((Date.now() - this._waitErrorStateSince) / 1000 > this._errorStateTimeoutSeconds) {
                this._log.error('AME has been in an error state for too long - assuming that job has failed');
                this._copySubmitStatus('AME has been in an error state for too long - assuming that job has failed');
                this._states.handle('end-check-history');
                return;
            }
        }
        setTimeout(function () { return _this._states.handle('wait'); }, 1000);
    };
    AMEQueuedJob.prototype._waitForJobCompletion = function () {
        var _this = this;
        var _a = [this._log, this._ame], log = _a[0], ame = _a[1];
        this._status = AMEQueuedJobStatus.Encoding;
        this._statusDetail = "";
        log.info("Querying AME job status..");
        ame.client.getJobStatus().then(function (status) {
            log.info("Queried AME job status (" + status.jobStatusText + ")");
            if (status.jobId != _this._submitStatus.jobId) {
                log.warn("AME is reporting a different current job than ours - probably finished processing it, must check server history for final result");
                _this._states.handle('end-check-history');
                return;
            }
            _this._mostRecentStatus = status;
            switch (status.jobStatus) {
                case ame_webservice_client_1.AMEJobStatus.Queued:
                case ame_webservice_client_1.AMEJobStatus.Encoding:
                case ame_webservice_client_1.AMEJobStatus.Paused:
                    _this._retryWait();
                    break;
                case ame_webservice_client_1.AMEJobStatus.NotFound:
                    log.error("AME reports no job found (server stopped?)");
                    _this._states.handle('end-check-history');
                    break;
                case ame_webservice_client_1.AMEJobStatus.Stopped:
                    log.error("AME reports our job as stopped (aborted)");
                    _this._status = AMEQueuedJobStatus.Aborted;
                    _this._statusDetail = "AME reports our job as stopped (aborted)";
                    _this._states.handle('end');
                    break;
                case ame_webservice_client_1.AMEJobStatus.Failed:
                    _this.statusDetail = "AME reports our job as failed";
                    log.error("AME reports our job as failed");
                    _this._states.handle('end');
                    break;
                case ame_webservice_client_1.AMEJobStatus.Success:
                    log.info("AME reports our job as successfully completed!");
                    _this._status = AMEQueuedJobStatus.Succeeded;
                    _this._statusDetail = "AME reports our job as successfully completed!";
                    _this._states.handle('end');
                    break;
                case ame_webservice_client_1.AMEJobStatus.Unknown:
                default:
                    log.warn("AME reports unknown job status '" + status.jobStatus + "'");
                    _this._retryWait(true);
                    break;
            }
            _this._emitProgress();
        }, function (error) {
            log.warn("AME is not responding");
            _this._retryWait(true);
            _this._emitProgress();
        });
    };
    AMEQueuedJob.prototype._copySubmitStatus = function (details, status) {
        if (details === void 0) { details = undefined; }
        if (status === void 0) { status = ame_webservice_client_1.AMEJobStatus.Failed; }
        if (this._mostRecentStatus == null)
            this._mostRecentStatus = clone(this._submitStatus);
        if (this._mostRecentStatus == null)
            this._mostRecentStatus = {
                serverStatus: ame_webservice_client_1.AMEServerStatus.Unknown,
                serverStatusText: ame_webservice_client_1.AMEServerStatus[ame_webservice_client_1.AMEServerStatus.Unknown],
                jobId: '',
                jobStatus: ame_webservice_client_1.AMEJobStatus.Unknown,
                jobStatusText: AMEQueuedJobStatus[ame_webservice_client_1.AMEJobStatus.Unknown],
                jobProgress: undefined,
                details: '(Job was never submitted to the server)'
            };
        if (this._mostRecentStatus.jobStatus != ame_webservice_client_1.AMEJobStatus.Success
            && this._mostRecentStatus.jobStatus != ame_webservice_client_1.AMEJobStatus.Failed
            && this._mostRecentStatus.jobStatus != ame_webservice_client_1.AMEJobStatus.Stopped) {
            this._mostRecentStatus.serverStatus = ame_webservice_client_1.AMEServerStatus.Unknown;
            this._mostRecentStatus.serverStatusText = ame_webservice_client_1.AMEServerStatus[ame_webservice_client_1.AMEServerStatus.Unknown];
            this._mostRecentStatus.jobStatus = status;
            this._mostRecentStatus.jobStatusText = ame_webservice_client_1.AMEJobStatus[status];
            if (details != undefined)
                this._mostRecentStatus.details = details;
        }
    };
    AMEQueuedJob.prototype._abortSubmitted = function () {
        var _this = this;
        var _a = [this._log, this._ame], log = _a[0], ame = _a[1];
        this._status = AMEQueuedJobStatus.Aborting;
        this._statusDetail = "Attempting to abort submitted job in AME.. (attempts left: " + this._abortRetries + ")";
        this._emitProgress(true);
        log.info("Getting AME job status before aborting job..");
        ame.client.getJobStatus().then(function (status) {
            if (status.jobId == _this._submitStatus.jobId) {
                log.info("Telling AME to abort the current job..");
                ame.client.abortJob().then(function () {
                    log.info("AME reports job successfully aborted!");
                    _this._copySubmitStatus("Aborted upon request");
                    _this._status = AMEQueuedJobStatus.Aborted;
                    _this._statusDetail = "AME reports job successfully aborted!";
                    _this._emitProgress();
                }, function (error) {
                    _this._statusDetail = "Error while aborting AME job: " + error.message;
                    log.error(_this._statusDetail);
                    _this._emitProgress(true);
                    _this._retryAbortSubmitted();
                });
            }
            else {
                log.error("AME returns different current job than ours - must check history for final status");
                _this._states.handle('end-check-history');
                _this._emitProgress();
            }
        }, function (error) {
            log.error("Error while requesting AME status before aborting job: " + error.message);
            _this._retryAbortSubmitted();
            _this._emitProgress();
        });
    };
    AMEQueuedJob.prototype._retryAbortSubmitted = function () {
        var _this = this;
        if (this._abortRetries-- > 0) {
            this._statusDetail = "Retrying abort in " + this._abortRetryDelaySeconds + "s (attempts left: " + this._abortRetries + ")";
            this._log.info(this._statusDetail);
            this._emitProgress(true);
            setTimeout(function () { return _this._states.handle('abort'); }, 1000 * this._abortRetryDelaySeconds);
        }
        else {
            this._statusDetail = "Number of retry attempts saturated - ending job..";
            this._log.info(this._statusDetail);
            this._emitProgress(true);
            this._states.handle('end-check-history');
        }
    };
    AMEQueuedJob.prototype._checkHistoryForStatus = function () {
        var _this = this;
        var _a = [this._log, this._ame], log = _a[0], ame = _a[1];
        if (this._mostRecentStatus != null
            && (this._mostRecentStatus.jobStatus == ame_webservice_client_1.AMEJobStatus.Success
                || this._mostRecentStatus.jobStatus == ame_webservice_client_1.AMEJobStatus.Failed)) {
            this._states.handle('end');
            return;
        }
        log.info("Getting AME job history..");
        ame.client.getJobHistory().then(function (history) {
            log.info("Got AME job history, trying to locate our job..");
            var found = false;
            if (history.historicJobs != null)
                history.historicJobs.every(function (h) {
                    if (h.jobId == _this._submitStatus.jobId) {
                        log.info("Found our job in the AME history!", h);
                        _this._mostRecentStatus = {
                            serverStatus: history.serverStatus,
                            serverStatusText: history.serverStatusText,
                            jobId: h.jobId,
                            jobStatus: h.jobStatus,
                            jobStatusText: h.jobStatusText,
                            jobProgress: h.jobProgress,
                            details: h.details
                        };
                        found = true;
                        return false;
                    }
                    return true;
                });
            if (!found)
                log.error("Could not find our job in the AME history!");
            _this._states.handle("end");
        }, function (error) {
            log.error("Unable to get AME job history: " + error.message);
            _this._copySubmitStatus("Unable to get AME job history: " + error.message);
            _this._states.handle("end");
        });
    };
    AMEQueuedJob.prototype._ended = function () {
        var _a = [this._log, this._ame], log = _a[0], ame = _a[1];
        var submitStatus = this._submitStatus;
        var lastStatus = this._mostRecentStatus;
        console.log("ended, status=" + this._status);
        if (this._status != AMEQueuedJobStatus.Aborted
            && this._status != AMEQueuedJobStatus.Failed
            && this._status != AMEQueuedJobStatus.Succeeded) {
            this._status = AMEQueuedJobStatus.Failed;
            this._copySubmitStatus();
        }
        this._emitProgress();
        this._safeEmit('ended', this);
    };
    return AMEQueuedJob;
}(events.EventEmitter));
exports.AMEQueuedJob = AMEQueuedJob;
var AdobeMediaEncoder = (function (_super) {
    __extends(AdobeMediaEncoder, _super);
    function AdobeMediaEncoder(options) {
        _super.call(this);
        this._http = null;
        this._log = null;
        this._queue = [];
        if (options.logger == null && options.loggerFactory == null)
            this._logFactory = new logging_interfaces_1.NullLoggerFactory();
        else if (options.logger != null && options.loggerFactory == null) {
            this._log = options.logger;
            this._logFactory = new logging_interfaces_1.ContextPrefixedLoggerFactory(options.logger);
        }
        else {
            this._log = options.logger;
            this._logFactory = options.loggerFactory;
        }
        if (this._log == null)
            this._log = this._logFactory.getLogger();
        this._options = options;
        this._client = new ame_webservice_client_1.AMEWebserviceClient(options);
    }
    Object.defineProperty(AdobeMediaEncoder.prototype, "client", {
        get: function () {
            return this._client;
        },
        enumerable: true,
        configurable: true
    });
    AdobeMediaEncoder.prototype.start = function () {
        var _this = this;
        var d = q.defer();
        q.all([this._setupNotificationsServer()]).then(function (promises) {
            _this._setupQueue();
            d.resolve();
        }, function (err) { return d.reject(err); });
        return d.promise;
    };
    AdobeMediaEncoder.prototype._setupQueue = function () {
        var _this = this;
        try {
            this._queueStates = StateMachine
                .configure()
                .initialState('idle')
                .onEnter(function () { if (_this._queue.length > 0)
                _this._queueStates.handle('enqueue'); })
                .on('enqueue').transitionTo('process')
                .state('process')
                .onEnter(function () { return _this._processNextQueuedJob(); })
                .on('idle').transitionTo('idle')
                .global()
                .onStateEnter(function (state) { return _this._log.info("QUEUE: Entering state " + state); })
                .onUnhandledEvent(function (event, state) { return _this._log.info("QUEUE: Unhandled event '" + event + "' in state '" + state + ".'"); })
                .start();
        }
        catch (err) {
            console.error(err.message + " at\n" + err.stack);
        }
    };
    AdobeMediaEncoder.prototype._processNextQueuedJob = function () {
        var _this = this;
        this._current = this._queue.shift();
        this._current.once('ended', function () { _this._queueStates.handle('idle'); });
        this._current.submit();
    };
    AdobeMediaEncoder.prototype.enqueueJob = function (job, id) {
        var qj = new AMEQueuedJob(job, this._logFactory, this, id);
        this._queue.push(qj);
        this._queueStates.handle('enqueue');
        return qj;
    };
    AdobeMediaEncoder.prototype._setupNotificationsServer = function () {
        var d = q.defer();
        if (this._options.enableNotificationsServer === true) {
            var server = this._http = http.createServer();
            server.on('request', function (req, res) {
                var body = "";
                req.on('data', function (chunk) { body += chunk; });
                req.on('end', function () {
                    res.writeHead(200);
                    res.end("");
                });
            });
            server.once('error', function (err) {
                d.reject(err);
            });
            server.once('listening', function () {
                d.resolve();
            });
            server.listen(this._options.notificationsPort);
        }
        else {
            d.resolve();
        }
        return d.promise;
    };
    AdobeMediaEncoder.prototype._stopNotificationsServer = function () {
        var d = q.defer();
        if (this._http != null) {
            this._http.close();
            this._http = null;
        }
        return d.promise;
    };
    return AdobeMediaEncoder;
}(events.EventEmitter));
exports.AdobeMediaEncoder = AdobeMediaEncoder;
//# sourceMappingURL=ame.js.map