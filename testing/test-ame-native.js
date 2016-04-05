var process = require('process');
var AdobeMediaEncoder = require('../dist').AdobeMediaEncoder;
var AMEPresetsTreeReader = require('../dist').AMEPresetsTreeReader;

var logging = require('logging-interfaces');
var logFactory = new logging.ContextPrefixedLoggerFactory(new logging.ConsoleLogger());

/*
AMEPresetsTreeReader.load("c:\\users\\rune\\Documents\\Adobe\\Adobe Media Encoder\\9.0\\Presets\\PresetTree.xml")
.then(
    (presets) => {
        if (process.argv.length > 2)
            console.log(JSON.stringify(presets.all[process.argv[2]], null, '\t'))
        else
            console.log(JSON.stringify(presets));
    },
    (err) => console.error("ERROR!", err)
);
*/

var ame = new AdobeMediaEncoder({
    enableNotificationsServer: false,
    notificationsPort: 8018,
    hostname: 'localhost',
    port: 8081,
    loggerFactory: logFactory
});

console.info("Starting AME gateway..")
ame.start().then(
    () =>
    {
        console.info("AME gateway started!");

        const submit = () => {
            var job1 = ame.enqueueJob(
            {
                sourceFilePath: "d:\\render_me.avi",
                destinationPath: "d:\\temp\\render_me.mxf",
                sourcePresetPath: "C:\\Program Files\\Adobe\\Adobe Media Encoder CC 2015\\MediaIO\\systempresets\\4D584620_444D5846\\DNX HQ 720p 23.976.epr",
                overwriteDestinationIfPresent: true
            }, 'job1');

            job1.on('progress', () =>
            {
                console.log(`Progress: ${job1.progress} (${job1.statusText})`);
            });

            job1.on('ended', () =>
            {
                console.log(`Ended: ${job1.status}`, job1.lastStatusResponse);
            })
        };

        // abort the current (for testing)
        ame.client.abortJob().then(() => submit(), (err) => console.log(err));
        //submit();
    },
    () =>
    {
        console.error("Error starting AME gateway");
    }
)
