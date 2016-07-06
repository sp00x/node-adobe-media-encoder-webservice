'use strict';
require('source-map-support').install();
var dist_1 = require('../dist');
var ame = new dist_1.AMEWebserviceClient({
    hostname: 'localhost',
    port: 8081
});
var cmd = process.argv[2];
if (cmd == 'list_presets') {
    //var p = new PresetsTreeReader("C:\\Users\\rune\\Documents\\Adobe\\Adobe Media Encoder\\9.0\\Presets\\PresetTree.xml");
    dist_1.AMEPresetsTreeReader.load("C:\\Users\\rune\\Documents\\Adobe\\Adobe Media Encoder\\9.0\\Presets\\PresetTree.xml")
        .then(function (presets) {
        console.log(JSON.stringify(presets, null, '  '));
    }, function (err) {
        console.error("problem:", err);
    });
}
else if (cmd == 'start_server' || cmd == "server_start") {
    ame.startServer().then(function () { return console.log("OK"); }, function (err) { return console.log("ERROR", err); });
}
else if (cmd == 'stop_server' || cmd == "server_stop") {
    ame.stopServer().then(function () { return console.log("OK"); }, function (err) { return console.log("ERROR", err); });
}
else if (cmd == "server_status") {
    ame.getServerStatus().then(function (status) { return console.log("OK", status); }, function (err) { return console.log("ERROR", err); });
}
else if (cmd == "submit_job" || cmd == "job_submit") {
    ame.submitJob({
        sourceFilePath: "d:\\render_me.avi",
        destinationPath: "d:\\render_me.mxf",
        //sourcePresetPath: "C:\\Users\\rune\\Documents\\Adobe\\Adobe Media Encoder\\9.0\\Presets\\AVC-Intra 100 1080 (PAL).epr",
        sourcePresetPath: "C:\\Program Files\\Adobe\\Adobe Media Encoder CC 2015\\MediaIO\\systempresets\\4D584620_444D5846\\DNX HQ 720p 23.976.epr",
        overwriteDestinationIfPresent: true
    })
        .then(function (status) { return console.log("OK", status); }, function (err) { return console.log("ERROR", err); });
}
else if (cmd == "job_history") {
    ame.getJobHistory().then(function (status) { return console.log("OK", status); }, function (err) { return console.log("ERROR", err); });
}
else if (cmd == "job_status") {
    //ame.getJobStatus(process.argv[3]).then(
    ame.getJobStatus().then(function (status) { return console.log("OK", status); }, function (err) { return console.log("ERROR", err); });
}
else if (cmd == "job_abort") {
    //ame.abortJob(process.argv[3]).then(
    ame.abortJob().then(function (status) { return console.log("OK", status); }, function (err) { return console.log("ERROR", err); });
}
else if (cmd == "ame") {
    var a = new dist_1.AdobeMediaEncoder({ enableNotificationsServer: true, notificationsPort: 8018, hostname: 'localhost', port: 8081 });
    console.log("Starting AME gateway..");
    a.start().then(function () {
        console.log("Started AME gateway, enqueuing job..");
        try {
            var job1 = a.enqueueJob({
                sourceFilePath: "d:\\render_me.avi",
                destinationPath: "d:\\temp\\render_me.mxf",
                sourcePresetPath: "C:\\Program Files\\Adobe\\Adobe Media Encoder CC 2015\\MediaIO\\systempresets\\4D584620_444D5846\\DNX HQ 720p 23.976.epr",
                overwriteDestinationIfPresent: true
            });
            job1.on('ended', function () {
                console.log(job1.status, job1.lastStatusResponse);
            });
            var job2 = a.enqueueJob({
                sourceFilePath: "d:\\render_me.avi",
                destinationPath: "d:\\temp\\render_me_again.mxf",
                sourcePresetPath: "C:\\Program Files\\Adobe\\Adobe Media Encoder CC 2015\\MediaIO\\systempresets\\4D584620_444D5846\\DNX HQ 720p 23.976.epr",
                overwriteDestinationIfPresent: true
            });
            job2.on('ended', function () {
                console.log(job2.status, job2.lastStatusResponse);
            });
        }
        catch (err) {
            console.error(err + "\n" + err.stack);
        }
        /*
        var job = a.enqueueJob(
        {
            sourceFilePath: "C:\\TEMP\\Cat Gets a BRAIN FREEZE!!-COGehsaDkM0.mp4",
            destinationPath: "c:\temp\out.mp4",
            sourcePresetPath: "C:\\Users\\runeb\\Documents\\Adobe\\Adobe Media Encoder\\9.0\\Presets\\HD 720p 25.epr",
            overwriteDestinationIfPresent: true
        });

        job.on('progress', () => {});

        job.on('enqueued', () => {});

        job.on('finished', () => {});

        job.submitted.then(
            () => {},
            (err) => {}
        );

        job.finished.then(
            () => {},
            (err) => {}
        );
        */
    }, function (err) { return console.error("failed to start server: " + err); });
}
// ame.getJobStatus('f8665f78-75d4-4ed1-948b-40334ec27563').then(
//     (status) => console.log("OK", status),
//     (err) => console.log("ERROR", err)
// );
// ABORT
// ame.getServerStatus().then(
//     (status) => {
//         console.log("STATUS", status);
//
//         if (status.jobStatus == AMEJobStatus.Encoding)
//         {
//             ame.abortJob(status.jobId).then(
//                 (status) => console.log("OK", status),
//                 (err) => console.log("ERROR", err)
//             );
//         }
//     },
//     (err) => console.log("ERROR", err)
// );
