'use strict';
var q = require('q');
var fs = require('fs');
var xml2js = require('xml2js');
var path = require('path');
function xmlValue(x, defaultValue) {
    if (defaultValue === void 0) { defaultValue = undefined; }
    return (x != null && x instanceof Array) ? x[0] : defaultValue;
}
var AMEPresetsReader = (function () {
    function AMEPresetsReader() {
    }
    AMEPresetsReader.normalizePresetName = function (pn) {
        return (pn || "").toString().toLowerCase().replace(/\s+/, ' ');
    };
    AMEPresetsReader.loadCache = function (path) {
        var d = q.defer();
        fs.readFile(path, function (err, data) {
            if (err)
                return d.reject(err);
            var xml = data.toString('utf-8');
            var x = xml2js.parseString(xml, function (err, result) {
                if (result.PremiereData == null)
                    return d.reject(new Error("Expected <PremiereData> document element"));
                var cache = {
                    all: {},
                    allNormalized: {},
                    list: []
                };
                AMEPresetsReader._loadCacheKeys(result.PremiereData, cache);
                d.resolve(cache);
            });
        });
        return d.promise;
    };
    AMEPresetsReader._loadCacheKeys = function (parentKeyNode, cache) {
        if (parentKeyNode.Key) {
            parentKeyNode.Key.forEach(function (node) {
                AMEPresetsReader._loadCacheKeys(node, cache);
            });
        }
        else if (parentKeyNode.DirectoryPath == null && parentKeyNode.PresetID != null) {
            var preset = {
                id: xmlValue(parentKeyNode.PresetID),
                path: xmlValue(parentKeyNode.PresetPath),
                fileType: xmlValue(parentKeyNode.PresetFileType),
                classId: xmlValue(parentKeyNode.PresetClassID),
                name: xmlValue(parentKeyNode.PresetName),
                modifiedTime: xmlValue(parentKeyNode.PresetModifiedTime),
                folderDisplayPath: xmlValue(parentKeyNode.FolderDisplayPath)
            };
            preset.displayName = path.win32.parse(preset.path).name;
            var registryPath = path.posix.join(preset.folderDisplayPath, preset.displayName);
            cache.list.push(preset);
            cache.all[registryPath] = preset;
            cache.allNormalized[AMEPresetsReader.normalizePresetName(registryPath)] = preset;
        }
    };
    AMEPresetsReader.loadTree = function (path) {
        var d = q.defer();
        fs.readFile(path, function (err, data) {
            if (err)
                return d.reject(err);
            var xml = data.toString('utf-8');
            var x = xml2js.parseString(xml, function (err, result) {
                var tree = {
                    all: {},
                    allNormalized: {},
                    userPresets: null,
                    systemPresets: null,
                };
                tree.userPresets = AMEPresetsReader._loadPresetsTree(result.PremiereData.UserPresets, tree, true);
                tree.systemPresets = AMEPresetsReader._loadPresetsTree(result.PremiereData.SystemPresets, tree, true);
                d.resolve(tree);
            });
        });
        return d.promise;
    };
    AMEPresetsReader._loadPresetsTree = function (parentNode, tree, sort, parentPath) {
        if (sort === void 0) { sort = true; }
        if (parentPath === void 0) { parentPath = ""; }
        if (parentNode == null || parentNode.Length == 0)
            return null;
        var items = parentNode[0].PresetsUIItem.map(function (itemNode) {
            var presetItem = {
                name: xmlValue(itemNode.Name),
                isFolder: false,
                itemTypeText: xmlValue(itemNode.ItemType),
                itemType: xmlValue(itemNode.ItemType) == "0" ? AMEPresetsTreeItemType.Preset : AMEPresetsTreeItemType.Folder,
                toolTipSummary: xmlValue(itemNode.ToolTipSum),
                comment: xmlValue(itemNode.Comment),
                targetRate: xmlValue(itemNode.TRate),
                fps: xmlValue(itemNode.FPS),
                frameSize: xmlValue(itemNode.FSize),
                presetType: xmlValue(itemNode.PresetType),
                folderZName: xmlValue(itemNode.FolderZName),
                formatName: xmlValue(itemNode.FormatName)
            };
            if (presetItem.itemType == AMEPresetsTreeItemType.Folder) {
                presetItem.isFolder = true;
                presetItem.isExpanded = xmlValue(itemNode.FolderState) == "true";
                presetItem.folderState = xmlValue(itemNode.FolderState);
            }
            if (itemNode.ProxyPreset != null && itemNode.ProxyPreset.length > 0) {
                var preset = presetItem.preset = {
                    path: xmlValue(itemNode.ProxyPreset[0].PresetPath),
                    fileType: xmlValue(itemNode.ProxyPreset[0].PresetFileType),
                    id: xmlValue(itemNode.ProxyPreset[0].PresetID),
                    classId: xmlValue(itemNode.ProxyPreset[0].PresetClassID),
                    name: xmlValue(itemNode.ProxyPreset[0].PresetName),
                    modifiedTime: xmlValue(itemNode.ProxyPreset[0].PresetModifiedTime),
                    folderDisplayPath: xmlValue(itemNode.ProxyPreset[0].FolderDisplayPath),
                };
                preset.displayName = path.win32.parse(preset.path).name;
            }
            var presetPath = path.posix.join(parentPath, presetItem.name);
            if (!presetItem.isFolder) {
                tree.all[presetPath] = presetItem;
                tree.allNormalized[AMEPresetsReader.normalizePresetName(presetPath)] = presetItem;
            }
            if (itemNode.SubList != null)
                presetItem.subList = AMEPresetsReader._loadPresetsTree(itemNode.SubList, tree, sort, presetPath);
            return presetItem;
        });
        if (sort)
            items.sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });
        return items;
    };
    return AMEPresetsReader;
}());
exports.AMEPresetsReader = AMEPresetsReader;
(function (AMEPresetsTreeItemType) {
    AMEPresetsTreeItemType[AMEPresetsTreeItemType["Preset"] = 0] = "Preset";
    AMEPresetsTreeItemType[AMEPresetsTreeItemType["Folder"] = 1] = "Folder";
})(exports.AMEPresetsTreeItemType || (exports.AMEPresetsTreeItemType = {}));
var AMEPresetsTreeItemType = exports.AMEPresetsTreeItemType;
//# sourceMappingURL=ame-presets-reader.js.map