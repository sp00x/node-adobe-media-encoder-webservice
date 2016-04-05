'use strict';
var q = require('q');
var request = require('request');
var http = require('http');
var url = require('url');
var xml2js = require('xml2js');
var XmlWriter = require('xml-writer');
var logging_interfaces_1 = require('logging-interfaces');
(function (AMESubmitResult) {
    AMESubmitResult[AMESubmitResult["Unknown"] = -1] = "Unknown";
    AMESubmitResult[AMESubmitResult["Accepted"] = 0] = "Accepted";
    AMESubmitResult[AMESubmitResult["Rejected"] = 1] = "Rejected";
    AMESubmitResult[AMESubmitResult["Busy"] = 2] = "Busy";
    AMESubmitResult[AMESubmitResult["BadSyntax"] = 3] = "BadSyntax";
    AMESubmitResult[AMESubmitResult["NoServer"] = 4] = "NoServer";
})(exports.AMESubmitResult || (exports.AMESubmitResult = {}));
var AMESubmitResult = exports.AMESubmitResult;
;
var ameSubmitResultReverseLookup = {
    'BadSyntax': AMESubmitResult.BadSyntax,
    'Rejected': AMESubmitResult.Rejected,
    'Accepted': AMESubmitResult.Accepted,
    'Busy': AMESubmitResult.Busy,
    'NoServer': AMESubmitResult.NoServer
};
(function (AMEServerStatus) {
    AMEServerStatus[AMEServerStatus["Unknown"] = -1] = "Unknown";
    AMEServerStatus[AMEServerStatus["Online"] = 1] = "Online";
    AMEServerStatus[AMEServerStatus["Offline"] = 0] = "Offline";
})(exports.AMEServerStatus || (exports.AMEServerStatus = {}));
var AMEServerStatus = exports.AMEServerStatus;
;
var ameServerStatusReverseLookup = {
    'Online': AMEServerStatus.Online,
    'Offline': AMEServerStatus.Offline
};
(function (AMEJobStatus) {
    AMEJobStatus[AMEJobStatus["Unknown"] = -1] = "Unknown";
    AMEJobStatus[AMEJobStatus["Queued"] = 0] = "Queued";
    AMEJobStatus[AMEJobStatus["Encoding"] = 1] = "Encoding";
    AMEJobStatus[AMEJobStatus["Stopped"] = 2] = "Stopped";
    AMEJobStatus[AMEJobStatus["Paused"] = 3] = "Paused";
    AMEJobStatus[AMEJobStatus["Success"] = 4] = "Success";
    AMEJobStatus[AMEJobStatus["Failed"] = 5] = "Failed";
    AMEJobStatus[AMEJobStatus["NotFound"] = 6] = "NotFound";
})(exports.AMEJobStatus || (exports.AMEJobStatus = {}));
var AMEJobStatus = exports.AMEJobStatus;
;
var ameJobStatusReverseLookup = {
    'Queued': AMEJobStatus.Queued,
    'Encoding': AMEJobStatus.Encoding,
    'Stopped': AMEJobStatus.Stopped,
    'Paused': AMEJobStatus.Paused,
    'Success': AMEJobStatus.Success,
    'Failed': AMEJobStatus.Failed,
    'Not Found': AMEJobStatus.NotFound
};
function xmlValue(x, defaultValue) {
    if (defaultValue === void 0) { defaultValue = undefined; }
    return (x != null && x instanceof Array) ? x[0] : defaultValue;
}
var AMEWebserviceClient = (function () {
    function AMEWebserviceClient(config) {
        this.AME_DEFAULT_PORT = 8080;
        this.JOBS_API_PATH = '/job';
        this.SERVER_API_PATH = '/server';
        this.HISTORY_API_PATH = '/history';
        this._config = config;
        this._log = (config.logger == null) ? new logging_interfaces_1.NullLogger() : config.logger;
        var baseUrl = url.format({
            protocol: 'http',
            hostname: config.hostname || 'localhost',
            port: ((config.port == null) ? this.AME_DEFAULT_PORT.toString() : config.port).toString(),
        });
        this._jobsApiUrl = url.resolve(baseUrl, this.JOBS_API_PATH);
        this._serverApiUrl = url.resolve(baseUrl, this.SERVER_API_PATH);
        this._historyApiUrl = url.resolve(baseUrl, this.HISTORY_API_PATH);
    }
    AMEWebserviceClient.prototype.stopServer = function () {
        var d = q.defer();
        request({
            method: 'DELETE',
            url: this._serverApiUrl
        }, function (err, response, body) {
            if (err)
                return d.reject(err);
            else if (Math.floor(response.statusCode / 100) != 2)
                d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else
                d.resolve();
        });
        return d.promise;
    };
    AMEWebserviceClient.prototype.startServer = function () {
        var d = q.defer();
        request({
            method: 'POST',
            url: this._serverApiUrl
        }, function (err, response, body) {
            console.dir(body);
            if (err)
                return d.reject(err);
            else if (Math.floor(response.statusCode / 100) != 2)
                d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else
                d.resolve();
        });
        return d.promise;
    };
    AMEWebserviceClient.prototype.getServerStatus = function () {
        var d = q.defer();
        request({
            method: 'GET',
            url: this._serverApiUrl,
            headers: {
                accept: 'application/xml,text/xml'
            }
        }, function (err, response, body) {
            if (err)
                d.reject(err);
            else if (Math.floor(response.statusCode / 100) != 2)
                d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else
                AMEWebserviceClient.parseServerStatusResponse(body).then(function (status) { return d.resolve(status); }, function (err) { return d.reject(err); });
        });
        return d.promise;
    };
    AMEWebserviceClient.buildJobXml = function (job) {
        var xw = new XmlWriter(true);
        xw.startDocument();
        xw.startElement("manifest").writeAttribute("version", "1.0");
        xw.startElement("SourceFilePath").text(job.sourceFilePath).endElement();
        xw.startElement("DestinationPath").text(job.destinationPath).endElement();
        xw.startElement("SourcePresetPath").text(job.sourcePresetPath).endElement();
        if (job.overwriteDestinationIfPresent != null)
            xw.startElement("OverwriteDestinationIfPresent").text(job.overwriteDestinationIfPresent === true ? "true" : "false").endElement();
        if (job.notificationTarget != null)
            xw.startElement("notificationTarget").text(job.notificationTarget).endElement();
        if (job.backupNotificationTarget != null)
            xw.startElement("BackupNotificationTarget").text(job.backupNotificationTarget).endElement();
        if (job.notificationRateInMilliseconds != null)
            xw.startElement("NotificationRateInMilliseconds").text(job.notificationRateInMilliseconds.toString()).endElement();
        xw.endElement();
        xw.endDocument();
        var xml = xw.toString();
        return xml;
    };
    AMEWebserviceClient.prototype.submitJob = function (job) {
        var d = q.defer();
        var xml = AMEWebserviceClient.buildJobXml(job);
        var postData = new Buffer(xml, 'utf-8');
        var u = url.parse(this._jobsApiUrl);
        var req = http.request({
            method: 'POST',
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port == null ? undefined : parseInt(u.port),
            path: u.path,
            headers: {
                'Content-Length': postData.length,
                'Content-Type': 'text/xml',
                'Accept': 'text/xml,application/xml'
            },
            agent: false
        });
        req.once('response', function (res) {
            if (Math.floor(res.statusCode / 100) != 2)
                return d.reject(new Error("Expected HTTP status code 2XX, got " + res.statusCode));
            res.setEncoding('utf8');
            var data = "";
            res.on('data', function (chunk) { return data += chunk; });
            res.on('end', function () {
                AMEWebserviceClient.parseJobSubmitStatusResponse(data).then(function (status) { return d.resolve(status); }, function (err) { return d.reject(err); });
            });
        });
        req.once('error', function (err) {
            d.reject(err);
        });
        req.write(postData);
        req.end();
        return d.promise;
    };
    AMEWebserviceClient.prototype.abortJob = function () {
        var d = q.defer();
        var jobId = null;
        request({
            method: 'DELETE',
            url: this._jobsApiUrl + ((jobId != null) ? "?jobId=" + jobId : "")
        }, function (err, response, body) {
            if (err)
                d.reject(err);
            else if (Math.floor(response.statusCode / 100) != 2)
                d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else
                d.resolve();
        });
        return d.promise;
    };
    AMEWebserviceClient.prototype.getJobStatus = function () {
        var d = q.defer();
        var jobId = null;
        request({
            method: 'GET',
            url: this._jobsApiUrl + ((jobId != null) ? "?jobId=" + jobId : ""),
            headers: {
                accept: 'application/xml,text/xml'
            }
        }, function (err, response, body) {
            if (err)
                d.reject(err);
            else if (Math.floor(response.statusCode / 100) != 2)
                d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else
                AMEWebserviceClient.parseJobStatusResponse(body).then(function (status) { return d.resolve(status); }, function (err) { return d.reject(err); });
        });
        return d.promise;
    };
    AMEWebserviceClient.prototype.getJobHistory = function () {
        var d = q.defer();
        request({
            method: 'GET',
            url: this._historyApiUrl,
            headers: {
                accept: 'application/xml,text/xml'
            }
        }, function (err, response, body) {
            if (err)
                d.reject(err);
            else if (Math.floor(response.statusCode / 100) != 2)
                d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else
                AMEWebserviceClient.parseJobHistoryResponse(body).then(function (history) { return d.resolve(history); }, function (err) { return d.reject(err); });
        });
        return d.promise;
    };
    AMEWebserviceClient.parseServerStatusEnum = function (s) {
        var r = ameServerStatusReverseLookup[s];
        return (r === undefined) ? AMEServerStatus.Unknown : r;
    };
    AMEWebserviceClient.parseJobStatusEnum = function (s) {
        var r = ameJobStatusReverseLookup[s];
        return (r === undefined) ? AMEJobStatus.Unknown : r;
    };
    AMEWebserviceClient.parseSubmitResultEnum = function (s) {
        var r = ameSubmitResultReverseLookup[s];
        return (r === undefined) ? AMESubmitResult.Unknown : r;
    };
    AMEWebserviceClient.parseServerStatusResponse = function (xml) {
        var d = q.defer();
        xml2js.parseString(xml, function (err, res) {
            if (err)
                return d.reject(err);
            else if (res.payload == null || typeof res.payload != 'object')
                return d.reject("Invalid XML (expected 'payload' document element)");
            else {
                var status_1 = {
                    serverIp: xmlValue(res.payload.ServerIP),
                    serverPort: parseInt(xmlValue(res.payload.ServerPort)),
                    restartThreshold: parseInt(xmlValue(res.payload.RestartThreshold)),
                    jobHistorySize: parseInt(xmlValue(res.payload.JobHistorySize)),
                    serverStatus: AMEWebserviceClient.parseServerStatusEnum(xmlValue(res.payload.ServerStatus)),
                    serverStatusText: xmlValue(res.payload.ServerStatus),
                    jobId: xmlValue(res.payload.JobId),
                    jobStatus: AMEWebserviceClient.parseJobStatusEnum(xmlValue(res.payload.JobStatus)),
                    jobStatusText: xmlValue(res.payload.JobStatus),
                    jobProgress: parseFloat(xmlValue(res.payload.JobProgress)),
                    details: xmlValue(res.payload.Details)
                };
                if (isNaN(status_1.jobProgress))
                    delete status_1.jobProgress;
                d.resolve(status_1);
            }
        });
        return d.promise;
    };
    AMEWebserviceClient.parseJobStatusResponse = function (xml) {
        var d = q.defer();
        xml2js.parseString(xml, function (err, res) {
            if (err)
                return d.reject(err);
            else if (res.payload == null || typeof res.payload != 'object')
                return d.reject("Invalid XML (expected 'payload' document element)");
            else {
                var status_2 = {
                    serverStatus: AMEWebserviceClient.parseServerStatusEnum(xmlValue(res.payload.ServerStatus)),
                    serverStatusText: xmlValue(res.payload.ServerStatus),
                    jobStatus: AMEWebserviceClient.parseJobStatusEnum(xmlValue(res.payload.JobStatus)),
                    jobStatusText: xmlValue(res.payload.JobStatus),
                    jobId: xmlValue(res.payload.JobId),
                    jobProgress: parseFloat(xmlValue(res.payload.JobProgress)),
                    details: xmlValue(res.payload.Details)
                };
                if (isNaN(status_2.jobProgress))
                    delete status_2.jobProgress;
                d.resolve(status_2);
            }
        });
        return d.promise;
    };
    AMEWebserviceClient.parseJobSubmitStatusResponse = function (xml) {
        var d = q.defer();
        xml2js.parseString(xml, function (err, res) {
            if (err)
                return d.reject(err);
            else if (res.payload == null || typeof res.payload != 'object')
                return d.reject("Invalid XML (expected 'payload' document element)");
            else {
                var status_3 = {
                    serverStatus: AMEWebserviceClient.parseServerStatusEnum(xmlValue(res.payload.ServerStatus)),
                    serverStatusText: xmlValue(res.payload.ServerStatus),
                    jobStatus: AMEWebserviceClient.parseJobStatusEnum(xmlValue(res.payload.JobStatus)),
                    jobStatusText: xmlValue(res.payload.JobStatus),
                    submitResult: AMEWebserviceClient.parseSubmitResultEnum(xmlValue(res.payload.SubmitResult)),
                    submitResultText: xmlValue(res.payload.SubmitResult),
                    jobId: xmlValue(res.payload.JobId),
                    jobProgress: parseFloat(xmlValue(res.payload.JobProgress)),
                    details: xmlValue(res.payload.Details)
                };
                if (isNaN(status_3.jobProgress))
                    delete status_3.jobProgress;
                d.resolve(status_3);
            }
        });
        return d.promise;
    };
    AMEWebserviceClient.parseJobHistoryResponse = function (xml) {
        var d = q.defer();
        xml2js.parseString(xml, function (err, res) {
            if (err)
                return d.reject(err);
            else if (res.payload == null || typeof res.payload != 'object')
                return d.reject("Invalid XML (expected 'payload' document element)");
            else {
                var history_1 = {
                    serverStatus: AMEWebserviceClient.parseServerStatusEnum(xmlValue(res.payload.ServerStatus)),
                    serverStatusText: xmlValue(res.payload.ServerStatus),
                    jobId: xmlValue(res.payload.JobId),
                    jobStatus: AMEWebserviceClient.parseJobStatusEnum(xmlValue(res.payload.JobStatus)),
                    jobStatusText: xmlValue(res.payload.JobStatus),
                    details: xmlValue(res.payload.Details),
                    jobProgress: parseFloat(xmlValue(res.payload.JobProgress)),
                    sourcePresetPath: xmlValue(res.payload.SourcePresetPath),
                    sourceFilePath: xmlValue(res.payload.SourceFilePath),
                    destinationPath: xmlValue(res.payload.DestinationPath),
                    historicJobs: []
                };
                if (res.payload.CompletedJobs instanceof Array && res.payload.CompletedJobs.length > 0 && res.payload.CompletedJobs[0].Job instanceof Array) {
                    history_1.historicJobs = res.payload.CompletedJobs[0].Job.map(function (j) {
                        return {
                            jobId: xmlValue(j.JobId),
                            jobStatus: AMEWebserviceClient.parseJobStatusEnum(xmlValue(j.JobStatus)),
                            jobStatusText: xmlValue(j.JobStatus),
                            details: xmlValue(j.Details),
                            sourcePresetPath: xmlValue(j.SourcePresetPath),
                            sourceFilePath: xmlValue(j.SourceFilePath),
                            destinationPath: xmlValue(j.DestinationPath),
                        };
                    });
                }
                d.resolve(history_1);
            }
        });
        return d.promise;
    };
    return AMEWebserviceClient;
}());
exports.AMEWebserviceClient = AMEWebserviceClient;
//# sourceMappingURL=ame-webservice-client.js.map