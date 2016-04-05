'use strict';
var q = require('q');
var fs = require('fs');
var xml2js = require('xml2js');
var path = require('path');
function xmlValue(x, defaultValue) {
    if (defaultValue === void 0) { defaultValue = undefined; }
    return (x != null && x instanceof Array) ? x[0] : defaultValue;
}
var AMEPresetsTreeReader = (function () {
    function AMEPresetsTreeReader() {
    }
    AMEPresetsTreeReader.load = function (path) {
        var d = q.defer();
        fs.readFile(path, function (err, data) {
            if (err)
                return d.reject(err);
            var xml = data.toString('utf-8');
            var x = xml2js.parseString(xml, function (err, result) {
                var registry = {};
                var list = {
                    all: registry,
                    userPresets: AMEPresetsTreeReader._loadPresetsTree(result.PremiereData.UserPresets, registry, true),
                    systemPresets: AMEPresetsTreeReader._loadPresetsTree(result.PremiereData.SystemPresets, registry, true)
                };
                d.resolve(list);
            });
        });
        return d.promise;
    };
    AMEPresetsTreeReader._loadPresetsTree = function (parentNode, registry, sort, parentPath) {
        if (sort === void 0) { sort = true; }
        if (parentPath === void 0) { parentPath = ""; }
        if (parentNode == null || parentNode.Length == 0)
            return null;
        var items = parentNode[0].PresetsUIItem.map(function (it) {
            var i = {
                name: xmlValue(it.Name),
                isFolder: false,
                itemTypeText: xmlValue(it.ItemType),
                itemType: xmlValue(it.ItemType) == "0" ? AMEPresetsTreeItemType.Preset : AMEPresetsTreeItemType.Folder,
                toolTipSummary: xmlValue(it.ToolTipSum),
                comment: xmlValue(it.Comment),
                targetRate: xmlValue(it.TRate),
                fps: xmlValue(it.FPS),
                frameSize: xmlValue(it.FSize),
                presetType: xmlValue(it.PresetType),
                folderZName: xmlValue(it.FolderZName),
                formatName: xmlValue(it.FormatName)
            };
            if (i.itemType == AMEPresetsTreeItemType.Folder) {
                i.isFolder = true;
                i.isExpanded = xmlValue(it.FolderState) == "true";
                i.folderState = xmlValue(it.FolderState);
            }
            if (it.ProxyPreset != null && it.ProxyPreset.length > 0) {
                i.preset = {
                    path: xmlValue(it.ProxyPreset[0].PresetPath),
                    fileType: xmlValue(it.ProxyPreset[0].PresetFileType),
                    id: xmlValue(it.ProxyPreset[0].PresetID),
                    classId: xmlValue(it.ProxyPreset[0].PresetClassID),
                    name: xmlValue(it.ProxyPreset[0].PresetName),
                    modifiedTime: xmlValue(it.ProxyPreset[0].PresetModifiedTime),
                    folderDisplayPath: xmlValue(it.ProxyPreset[0].FolderDisplayPath)
                };
            }
            var presetPath = path.posix.join(parentPath, i.name);
            if (!i.isFolder)
                registry[presetPath] = i;
            if (it.SubList != null)
                i.subList = AMEPresetsTreeReader._loadPresetsTree(it.SubList, registry, sort, presetPath);
            return i;
        });
        if (sort)
            items.sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });
        return items;
    };
    return AMEPresetsTreeReader;
}());
exports.AMEPresetsTreeReader = AMEPresetsTreeReader;
(function (AMEPresetsTreeItemType) {
    AMEPresetsTreeItemType[AMEPresetsTreeItemType["Preset"] = 0] = "Preset";
    AMEPresetsTreeItemType[AMEPresetsTreeItemType["Folder"] = 1] = "Folder";
})(exports.AMEPresetsTreeItemType || (exports.AMEPresetsTreeItemType = {}));
var AMEPresetsTreeItemType = exports.AMEPresetsTreeItemType;
//# sourceMappingURL=ame-presets-tree-reader.js.map