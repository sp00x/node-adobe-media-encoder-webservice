/// <reference path="../typings/main.d.ts"/>
'use strict';

import q = require('q');
import request = require('request');
import http = require('http');
import url = require('url');
import xml2js = require('xml2js');

const XmlWriter = require('xml-writer');

import { ILogger, NullLogger } from 'logging-interfaces';

export interface IAMEWebserviceClientConfig
{
    hostname?: string;
    port?: number;
    logger?: ILogger;
}

export enum AMESubmitResult {
    Unknown = -1,
    Accepted = 0,
    Rejected = 1,
    Busy = 2,
    BadSyntax = 3,
    NoServer = 4
};

const ameSubmitResultReverseLookup: {[key: string]: AMESubmitResult} = {
    'BadSyntax': AMESubmitResult.BadSyntax,
    'Rejected': AMESubmitResult.Rejected,
    'Accepted': AMESubmitResult.Accepted,
    'Busy': AMESubmitResult.Busy,
    'NoServer': AMESubmitResult.NoServer
}

export enum AMEServerStatus {
    Unknown = -1,
    Online = 1,
    Offline = 0
};

const ameServerStatusReverseLookup: {[key: string]: AMEServerStatus} = {
    'Online': AMEServerStatus.Online,
    'Offline': AMEServerStatus.Offline
}

export enum AMEJobStatus {
    Unknown = -1,
    Queued = 0,
    Encoding = 1,
    Stopped = 2,
    Paused = 3,
    Success = 4,
    Failed = 5,
    NotFound = 6
};

const ameJobStatusReverseLookup: {[key: string]: AMEJobStatus} = {
    'Queued': AMEJobStatus.Queued,
    'Encoding': AMEJobStatus.Encoding,
    'Stopped': AMEJobStatus.Stopped,
    'Paused': AMEJobStatus.Paused,
    'Success': AMEJobStatus.Success,
    'Failed': AMEJobStatus.Failed,
    'Not Found': AMEJobStatus.NotFound
}

function xmlValue(x: any, defaultValue: any = undefined)
{
    return (x != null && x instanceof Array) ? x[0] : defaultValue;
}

export interface IAMEWebserviceClient
{
    // server
    stopServer(): q.Promise<void>;
    startServer(): q.Promise<void>;
    getServerStatus(): q.Promise<IAMEServerStatusResponse>;

    // job
    submitJob(job: IAMEJobSubmission): q.Promise<IAMESubmitJobResponse>;
    abortJob(): q.Promise<void>;
    getJobStatus(): q.Promise<IAMEJobStatusResponse>;

    // history
    getJobHistory(): q.Promise<IAMEJobHistoryResponse>;
}

export class AMEWebserviceClient implements IAMEWebserviceClient
{
    private _config: IAMEWebserviceClientConfig;

    private _log: ILogger;

    private _jobsApiUrl: string;
    private _serverApiUrl: string;
    private _historyApiUrl: string;

    private AME_DEFAULT_PORT: number = 8080;

    private JOBS_API_PATH: string = '/job';
    private SERVER_API_PATH: string = '/server';
    private HISTORY_API_PATH: string = '/history';

    constructor(config: IAMEWebserviceClientConfig)
    {
        this._config = config;

        this._log = (config.logger == null) ? new NullLogger() : config.logger;

        const baseUrl = url.format({
            protocol: 'http',
            hostname: config.hostname || 'localhost',
            port: ((config.port == null) ? this.AME_DEFAULT_PORT.toString() : config.port).toString(),
        });

        this._jobsApiUrl = url.resolve(baseUrl, this.JOBS_API_PATH);
        this._serverApiUrl = url.resolve(baseUrl, this.SERVER_API_PATH);
        this._historyApiUrl = url.resolve(baseUrl, this.HISTORY_API_PATH);
    }

    stopServer(): q.Promise<void>
    {
        const d = q.defer<void>();

        request({
            method: 'DELETE',
            url: this._serverApiUrl
        },
        (err: Error, response: any, body: any) =>
        {
            if (err) return d.reject(err);
            else if (Math.floor(response.statusCode/100) != 2) d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else d.resolve();
        });

        return d.promise;
    }

    startServer(): q.Promise<void>
    {
        const d = q.defer<void>();

        request({
            method: 'POST',
            url: this._serverApiUrl
        },
        (err: Error, response: any, body: any) =>
        {
            console.dir(body);

            if (err) return d.reject(err);
            else if (Math.floor(response.statusCode/100) != 2) d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else d.resolve();
        });

        return d.promise;
    }

    getServerStatus(): q.Promise<IAMEServerStatusResponse>
    {
        const d = q.defer<IAMEServerStatusResponse>();

        request({
            method: 'GET',
            url: this._serverApiUrl,
            headers:
            {
                accept: 'application/xml,text/xml'
            }
        },
        (err: Error, response: any, body: any) =>
        {
            if (err) d.reject(err);
            else if (Math.floor(response.statusCode/100) != 2) d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else AMEWebserviceClient.parseServerStatusResponse(body).then(
                    (status: IAMEServerStatusResponse) => d.resolve(status),
                    (err: Error) => d.reject(err)
                );
        });

        return d.promise;
    }

    static buildJobXml(job: IAMEJobSubmission): string
    {
        const xw = new XmlWriter(true);

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

        xw.endElement(); // </manifest>
        xw.endDocument();

        const xml: string = xw.toString();

        return xml;
    }

    submitJob(job: IAMEJobSubmission): q.Promise<IAMESubmitJobResponse>
    {
        const d = q.defer<IAMESubmitJobResponse>();

        const xml: string = AMEWebserviceClient.buildJobXml(job);

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
        req.once('response', (res: any) =>
        {
            if (Math.floor(res.statusCode/100) != 2)
                return d.reject(new Error("Expected HTTP status code 2XX, got " + res.statusCode));

            res.setEncoding('utf8');
            var data = "";
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () =>
            {
                AMEWebserviceClient.parseJobSubmitStatusResponse(data).then(
                    (status: IAMESubmitJobResponse) => d.resolve(status),
                    (err: Error) => d.reject(err)
                );
            })
        });
        req.once('error', (err: any) => {
            d.reject(err);
        });
        req.write(postData);
        req.end();

        // I don't know why, but for some reason() AME just sits there doing
        // nothing if we use request(), and if you ctrl-c it starts some loop
        // burning cpu cycles..

        // request({
        //     method: 'POST',
        //     url: this._jobsApiUrl,
        //     /*
        //     headers: {
        //         'content-type': 'application/xml',
        //         'accept': 'application/xml,text/xml'
        //     }, */
        //     body: xml // new Buffer(xml, 'utf-8')
        // },
        // (err: Error, response: any, body: any) =>
        // {
        //     console.dir(body);
        //
        //     if (err) return d.reject(err);
        //     else if (Math.floor(response.statusCode/100) != 2) d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
        //     else d.resolve();
        // });
        //
        return d.promise;
    }

    // abortJob(job: string): q.Promise<void>;
    // abortJob(job: IAMEJobStatus): q.Promise<void>;
    // abortJob(job?: any): q.Promise<void>
    abortJob(): q.Promise<void>
    {
        const d = q.defer<void>();

        //const jobId: string = (typeof job == 'string') ? job : (job != null) ? job.jobId : null;
        const jobId: string = null;

        request({
            method: 'DELETE',
            url: this._jobsApiUrl + ((jobId != null) ? "?jobId=" + jobId : "")
        },
        (err: Error, response: any, body: any) =>
        {
            if (err) d.reject(err);
            else if (Math.floor(response.statusCode/100) != 2) d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else d.resolve();
        });

        return d.promise;
    }

    // getJobStatus(job: string): q.Promise<IAMEJobStatusResponse>;
    // getJobStatus(job: IAMEJobStatus): q.Promise<IAMEJobStatusResponse>;
    // getJobStatus(job?: any): q.Promise<IAMEJobStatusResponse>
    getJobStatus(): q.Promise<IAMEJobStatusResponse>
    {
        const d = q.defer<IAMEJobStatusResponse>();

        //const jobId: string = (typeof job == 'string') ? job : (job != null) ? job.jobId : null;
        const jobId: string = null;

        request({
            method: 'GET',
            url: this._jobsApiUrl + ((jobId != null) ? "?jobId=" + jobId : ""),
            headers:
            {
                accept: 'application/xml,text/xml'
            }
        },
        (err: Error, response: any, body: any) =>
        {
            if (err) d.reject(err);
            else if (Math.floor(response.statusCode/100) != 2) d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else AMEWebserviceClient.parseJobStatusResponse(body).then(
                    (status: IAMEJobStatusResponse) => d.resolve(status),
                    (err: Error) => d.reject(err)
                );
        });

        return d.promise;
    }

    getJobHistory(): q.Promise<IAMEJobHistoryResponse>
    {
        const d = q.defer<IAMEJobHistoryResponse>();

        request({
            method: 'GET',
            url: this._historyApiUrl,
            headers:
            {
                accept: 'application/xml,text/xml'
            }
        },
        (err: Error, response: any, body: any) =>
        {
            if (err) d.reject(err);
            else if (Math.floor(response.statusCode/100) != 2) d.reject(new Error("Expected HTTP status code 2XX, got " + response.statusCode));
            else AMEWebserviceClient.parseJobHistoryResponse(body).then(
                    (history: IAMEJobHistoryResponse) => d.resolve(history),
                    (err: Error) => d.reject(err)
                );
        });

        return d.promise;
    }

    static parseServerStatusEnum(s: string): AMEServerStatus
    {
        var r = ameServerStatusReverseLookup[s];
        return (r === undefined) ? AMEServerStatus.Unknown : r;
    }

    static parseJobStatusEnum(s: string): AMEJobStatus
    {
        var r = ameJobStatusReverseLookup[s]
        return (r === undefined) ? AMEJobStatus.Unknown : r;
    }

    static parseSubmitResultEnum(s: string): AMESubmitResult
    {
        var r = ameSubmitResultReverseLookup[s];
        return (r === undefined) ? AMESubmitResult.Unknown : r;
    }

    static parseServerStatusResponse(xml: string): q.Promise<IAMEServerStatusResponse>
    {
        const d = q.defer<IAMEServerStatusResponse>();
        xml2js.parseString(xml, (err: Error, res: any) =>
        {
            if (err) return d.reject(err);
            else if (res.payload == null || typeof res.payload != 'object') return d.reject("Invalid XML (expected 'payload' document element)");
            else
            {
                const status: IAMEServerStatusResponse = <IAMEServerStatusResponse>{
                    serverIp: xmlValue(res.payload.ServerIP),
                    serverPort: parseInt(xmlValue(res.payload.ServerPort)),
                    restartThreshold: parseInt(xmlValue(res.payload.RestartThreshold)),
                    jobHistorySize:  parseInt(xmlValue(res.payload.JobHistorySize)),
                    serverStatus: AMEWebserviceClient.parseServerStatusEnum(xmlValue(res.payload.ServerStatus)),
                    serverStatusText: xmlValue(res.payload.ServerStatus),
                    jobId: xmlValue(res.payload.JobId),
                    jobStatus: AMEWebserviceClient.parseJobStatusEnum(xmlValue(res.payload.JobStatus)),
                    jobStatusText: xmlValue(res.payload.JobStatus),
                    jobProgress: parseFloat(xmlValue(res.payload.JobProgress)),
                    details: xmlValue(res.payload.Details)
                };
                if (isNaN(status.jobProgress)) delete status.jobProgress;
                d.resolve(status);
            }
        });
        return d.promise;
    }

    static parseJobStatusResponse(xml: string): q.Promise<IAMEJobStatusResponse>
    {
        const d = q.defer<IAMEJobStatusResponse>();
        xml2js.parseString(xml, (err: Error, res: any) =>
        {
            if (err) return d.reject(err);
            else if (res.payload == null || typeof res.payload != 'object') return d.reject("Invalid XML (expected 'payload' document element)");
            else
            {
                const status: IAMEJobStatusResponse = <IAMEJobStatusResponse>{
                    serverStatus: AMEWebserviceClient.parseServerStatusEnum(xmlValue(res.payload.ServerStatus)),
                    serverStatusText: xmlValue(res.payload.ServerStatus),
                    jobStatus: AMEWebserviceClient.parseJobStatusEnum(xmlValue(res.payload.JobStatus)),
                    jobStatusText: xmlValue(res.payload.JobStatus),
                    jobId: xmlValue(res.payload.JobId),
                    jobProgress: parseFloat(xmlValue(res.payload.JobProgress)),
                    details: xmlValue(res.payload.Details)
                };
                if (isNaN(status.jobProgress)) delete status.jobProgress;
                d.resolve(status);
            }
        });
        return d.promise;
    }

    static parseJobSubmitStatusResponse(xml: string): q.Promise<IAMESubmitJobResponse>
    {
        const d = q.defer<IAMESubmitJobResponse>();
        xml2js.parseString(xml, (err: Error, res: any) =>
        {
            if (err) return d.reject(err);
            else if (res.payload == null || typeof res.payload != 'object') return d.reject("Invalid XML (expected 'payload' document element)");
            else
            {
                const status: IAMESubmitJobResponse = <IAMESubmitJobResponse>{
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
                if (isNaN(status.jobProgress)) delete status.jobProgress;
                d.resolve(status);
            }
        });
        return d.promise;
    }

    static parseJobHistoryResponse(xml: string): q.Promise<IAMEJobHistoryResponse>
    {
        const d = q.defer<IAMEJobHistoryResponse>();
        xml2js.parseString(xml, (err: Error, res: any) =>
        {
            if (err) return d.reject(err);
            else if (res.payload == null || typeof res.payload != 'object') return d.reject("Invalid XML (expected 'payload' document element)");
            else
            {
                const history: IAMEJobHistoryResponse = <IAMEJobHistoryResponse>{

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

                if (res.payload.CompletedJobs instanceof Array && res.payload.CompletedJobs.length > 0 && res.payload.CompletedJobs[0].Job instanceof Array)
                {
                    history.historicJobs = res.payload.CompletedJobs[0].Job.map((j: any) =>
                    {
                        return <IAMEHistoricJob>{
                            jobId: xmlValue(j.JobId),
                            jobStatus: AMEWebserviceClient.parseJobStatusEnum(xmlValue(j.JobStatus)),
                            jobStatusText: xmlValue(j.JobStatus),
                            details: xmlValue(j.Details),
                            //jobProgress: parseFloat(xmlValue(j.JobProgress)),
                            sourcePresetPath: xmlValue(j.SourcePresetPath),
                            sourceFilePath: xmlValue(j.SourceFilePath),
                            destinationPath: xmlValue(j.DestinationPath),
                        }
                    })
                }

                //if (isNaN(history.jobProgress)) delete history.jobProgress;
                d.resolve(history);
            }
        });
        return d.promise;
    }

}

///----------------------------------------------------------------------------
///
/// various interface building blocks
///
///----------------------------------------------------------------------------

export interface IAMEServerStatus
{
    serverStatus: AMEServerStatus;
    serverStatusText: string;
}

export interface IAMEJobStatus
{
    jobStatus: AMEJobStatus;
    jobStatusText: string;
    jobId: string;
    jobProgress?: number;
    details: string;
}

export interface IAMEJobSubmitStatus
{
    submitResult: AMESubmitResult;
    submitResultText: string;
}

export interface IAMEServerInfo
{
    serverIp: string;
    serverPort: number;
    restartThreshold: number;
    jobHistorySize: number;
}

export interface IAMEJobInfo
{
    sourceFilePath: string;
    destinationPath: string;
    sourcePresetPath: string;
}

export interface IAMEHistoricJob extends IAMEJobInfo, IAMEJobStatus
{
}

///----------------------------------------------------------------------------
///
/// now, the actual types in use!
///
///----------------------------------------------------------------------------

// the stuff we POST to /job

export interface IAMEJobSubmission extends IAMEJobInfo
{
    overwriteDestinationIfPresent?: boolean;
    notificationTarget?: string;
    backupNotificationTarget?: string;
    notificationRateInMilliseconds?: number;
}

// POST /job

export interface IAMESubmitJobResponse extends IAMEServerStatus, IAMEJobStatus, IAMEJobSubmitStatus
{
}

// GET /job

export interface IAMEJobStatusResponse extends IAMEServerStatus, IAMEJobStatus
{
}

// GET /server

export interface IAMEServerStatusResponse extends IAMEServerStatus, IAMEServerInfo, IAMEJobStatus
{
}

// GET /history

export interface IAMEJobHistoryResponse extends IAMEServerStatus, IAMEHistoricJob
{
    historicJobs: Array<IAMEHistoricJob>;
}
