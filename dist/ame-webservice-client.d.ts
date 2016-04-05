/// <reference path="../typings/main.d.ts" />
import q = require('q');
import { ILogger } from 'logging-interfaces';
export interface IAMEWebserviceClientConfig {
    hostname?: string;
    port?: number;
    logger?: ILogger;
}
export declare enum AMESubmitResult {
    Unknown = -1,
    Accepted = 0,
    Rejected = 1,
    Busy = 2,
    BadSyntax = 3,
    NoServer = 4,
}
export declare enum AMEServerStatus {
    Unknown = -1,
    Online = 1,
    Offline = 0,
}
export declare enum AMEJobStatus {
    Unknown = -1,
    Queued = 0,
    Encoding = 1,
    Stopped = 2,
    Paused = 3,
    Success = 4,
    Failed = 5,
    NotFound = 6,
}
export interface IAMEWebserviceClient {
    stopServer(): q.Promise<void>;
    startServer(): q.Promise<void>;
    getServerStatus(): q.Promise<IAMEServerStatusResponse>;
    submitJob(job: IAMEJobSubmission): q.Promise<IAMESubmitJobResponse>;
    abortJob(): q.Promise<void>;
    getJobStatus(): q.Promise<IAMEJobStatusResponse>;
    getJobHistory(): q.Promise<IAMEJobHistoryResponse>;
}
export declare class AMEWebserviceClient implements IAMEWebserviceClient {
    private _config;
    private _log;
    private _jobsApiUrl;
    private _serverApiUrl;
    private _historyApiUrl;
    private AME_DEFAULT_PORT;
    private JOBS_API_PATH;
    private SERVER_API_PATH;
    private HISTORY_API_PATH;
    constructor(config: IAMEWebserviceClientConfig);
    stopServer(): q.Promise<void>;
    startServer(): q.Promise<void>;
    getServerStatus(): q.Promise<IAMEServerStatusResponse>;
    static buildJobXml(job: IAMEJobSubmission): string;
    submitJob(job: IAMEJobSubmission): q.Promise<IAMESubmitJobResponse>;
    abortJob(): q.Promise<void>;
    getJobStatus(): q.Promise<IAMEJobStatusResponse>;
    getJobHistory(): q.Promise<IAMEJobHistoryResponse>;
    static parseServerStatusEnum(s: string): AMEServerStatus;
    static parseJobStatusEnum(s: string): AMEJobStatus;
    static parseSubmitResultEnum(s: string): AMESubmitResult;
    static parseServerStatusResponse(xml: string): q.Promise<IAMEServerStatusResponse>;
    static parseJobStatusResponse(xml: string): q.Promise<IAMEJobStatusResponse>;
    static parseJobSubmitStatusResponse(xml: string): q.Promise<IAMESubmitJobResponse>;
    static parseJobHistoryResponse(xml: string): q.Promise<IAMEJobHistoryResponse>;
}
export interface IAMEServerStatus {
    serverStatus: AMEServerStatus;
    serverStatusText: string;
}
export interface IAMEJobStatus {
    jobStatus: AMEJobStatus;
    jobStatusText: string;
    jobId: string;
    jobProgress?: number;
    details: string;
}
export interface IAMEJobSubmitStatus {
    submitResult: AMESubmitResult;
    submitResultText: string;
}
export interface IAMEServerInfo {
    serverIp: string;
    serverPort: number;
    restartThreshold: number;
    jobHistorySize: number;
}
export interface IAMEJobInfo {
    sourceFilePath: string;
    destinationPath: string;
    sourcePresetPath: string;
}
export interface IAMEHistoricJob extends IAMEJobInfo, IAMEJobStatus {
}
export interface IAMEJobSubmission extends IAMEJobInfo {
    overwriteDestinationIfPresent?: boolean;
    notificationTarget?: string;
    backupNotificationTarget?: string;
    notificationRateInMilliseconds?: number;
}
export interface IAMESubmitJobResponse extends IAMEServerStatus, IAMEJobStatus, IAMEJobSubmitStatus {
}
export interface IAMEJobStatusResponse extends IAMEServerStatus, IAMEJobStatus {
}
export interface IAMEServerStatusResponse extends IAMEServerStatus, IAMEServerInfo, IAMEJobStatus {
}
export interface IAMEJobHistoryResponse extends IAMEServerStatus, IAMEHistoricJob {
    historicJobs: Array<IAMEHistoricJob>;
}
