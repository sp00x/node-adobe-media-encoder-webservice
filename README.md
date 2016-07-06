# node-adobe-media-encoder-webservice

Adobe Media Encoder "web service" (REST) client

Note: this uses a "private API" which was just discovered by luck inspecting another package, and most results are based on reverse-engineering and poking around.

## Known issues / to-do

### To-do

* Automatically resolve and load PresetTree.xml and PresetCache.xml files
	* resolve: roughly `%HOMEDRIVE%%HOMEPATH%\Documents\Adobe\Adobe Media Encoder\9.0\Presets`, and version numbers (e.g. `9.0`) can be read from the registry under `HKCU\Software\Adobe\Adobe Media Encoder`
	* PresetCache.xml is in ..  
* Automatically resolve preset paths by their name / preset tree path
* Start / stop the service or the console process if not running
* Make the retry delays and retry counts configurable somehow (submit & abort)
* Make some CONSTANTS for the enums?

### Known issues

* Suspect there is a failed retry counter decrease if AME web service is not running when submitting jobs?

## License

Not licensed for now (internal work-in-progress) - use at your own risk..
