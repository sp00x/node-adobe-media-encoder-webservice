/// <reference path="../typings/main.d.ts"/>
'use strict';

import q = require('q');
import fs = require('fs');
import xml2js = require('xml2js');
import path = require('path');

function xmlValue(x: any, defaultValue: any = undefined)
{
    return (x != null && x instanceof Array) ? x[0] : defaultValue;
}

export class AMEPresetsReader
{
    static normalizePresetName(pn: string): string
    {
        return (pn || "").toString().toLowerCase().replace(/\s+/, ' ');
    }

    static loadCache(path: string): q.Promise<IAMEPresetsCache>
    {
        const d = q.defer<IAMEPresetsCache>();

        fs.readFile(path, (err: any, data: any) =>
        {
            if (err) return d.reject(err);

            const xml: string = data.toString('utf-8');
            const x: any = xml2js.parseString(xml, (err: any, result: any) =>
            {
                if (result.PremiereData == null) return d.reject(new Error("Expected <PremiereData> document element"));

                const cache: IAMEPresetsCache =
                {
                    all: {},
                    allNormalized: {},
                    list: []
                };
                AMEPresetsReader._loadCacheKeys(result.PremiereData, cache);

                d.resolve(cache);
            });
        });

        return d.promise;
    }

    static _loadCacheKeys(parentKeyNode: any, cache: IAMEPresetsCache)
    {        
        if (parentKeyNode.Key)
        {
            parentKeyNode.Key.forEach((node: any) =>
            {
                AMEPresetsReader._loadCacheKeys(node, cache);
            })
        }
        else if (parentKeyNode.DirectoryPath == null && parentKeyNode.PresetID != null)
        {
            const preset: IAMEPreset = {
                id: xmlValue(parentKeyNode.PresetID),
                path: xmlValue(parentKeyNode.PresetPath),
                fileType: xmlValue(parentKeyNode.PresetFileType),
                classId: xmlValue(parentKeyNode.PresetClassID),
                name: xmlValue(parentKeyNode.PresetName),
                modifiedTime: xmlValue(parentKeyNode.PresetModifiedTime),
                folderDisplayPath: xmlValue(parentKeyNode.FolderDisplayPath)                
            }

            preset.displayName = path.win32.parse(preset.path).name;
            const registryPath: string = path.posix.join(preset.folderDisplayPath, preset.displayName);            

            cache.list.push(preset);
            cache.all[registryPath] = preset;
            cache.allNormalized[AMEPresetsReader.normalizePresetName(registryPath)] = preset;
        }
    }

    static loadTree(path: string): q.Promise<IAMEPresetsTree>
    {
        const d = q.defer<IAMEPresetsTree>();

        fs.readFile(path, (err: any, data: any) =>
        {
            if (err) return d.reject(err);

            const xml: string = data.toString('utf-8');
            const x: any = xml2js.parseString(xml, (err: any, result: any) =>
            {
                const tree: IAMEPresetsTree = {
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
    }

    private static _loadPresetsTree(parentNode: any, tree: IAMEPresetsTree, sort: boolean = true, parentPath: string = ""): Array<IAMEPresetsTreeItem>
    {
        if (parentNode == null || parentNode.Length == 0) return null;

        const items: IAMEPresetsTreeItem[] = parentNode[0].PresetsUIItem.map((itemNode: any) =>
        {
            const presetItem: IAMEPresetsTreeItem = <IAMEPresetsTreeItem>{
                name: xmlValue(itemNode.Name),
                isFolder: false,
                itemTypeText: xmlValue(itemNode.ItemType),
                itemType: xmlValue(itemNode.ItemType) == "0" ? AMEPresetsTreeItemType.Preset : AMEPresetsTreeItemType.Folder,
                toolTipSummary: xmlValue(itemNode.ToolTipSum),
                comment: xmlValue(itemNode.Comment),
                targetRate: xmlValue(itemNode.TRate),
                fps: xmlValue(itemNode.FPS),
                frameSize: xmlValue(itemNode.FSize),
                presetType: xmlValue(itemNode.PresetType), // ?
                folderZName: xmlValue(itemNode.FolderZName),
                formatName: xmlValue(itemNode.FormatName)
            };

            if (presetItem.itemType == AMEPresetsTreeItemType.Folder)
            {
                presetItem.isFolder = true;
                presetItem.isExpanded = xmlValue(itemNode.FolderState) == "true";
                presetItem.folderState = xmlValue(itemNode.FolderState);
            }

            if (itemNode.ProxyPreset != null && itemNode.ProxyPreset.length > 0)
            {
                const preset = presetItem.preset = <IAMEPreset>{
                    path: xmlValue(itemNode.ProxyPreset[0].PresetPath),
                    fileType: xmlValue(itemNode.ProxyPreset[0].PresetFileType),
                    id: xmlValue(itemNode.ProxyPreset[0].PresetID),
                    classId: xmlValue(itemNode.ProxyPreset[0].PresetClassID),
                    name: xmlValue(itemNode.ProxyPreset[0].PresetName),
                    modifiedTime: xmlValue(itemNode.ProxyPreset[0].PresetModifiedTime),
                    folderDisplayPath: xmlValue(itemNode.ProxyPreset[0].FolderDisplayPath),
                }
                preset.displayName = path.win32.parse(preset.path).name;
            }

            const presetPath = path.posix.join(parentPath, presetItem.name);

            if (!presetItem.isFolder)
            {
                tree.all[presetPath] = presetItem;
                tree.allNormalized[AMEPresetsReader.normalizePresetName(presetPath)] = presetItem;
            }

            if (itemNode.SubList != null)
                presetItem.subList = AMEPresetsReader._loadPresetsTree(itemNode.SubList, tree, sort, presetPath);

            return presetItem;
        });

        if (sort) items.sort((a: IAMEPresetsTreeItem, b: IAMEPresetsTreeItem) =>
        {
            return a.name.localeCompare(b.name);
        })

        return items;
    }
}

export interface IAMEPresetsTree
{
    all: {[key: string]: IAMEPresetsTreeItem};
    allNormalized: {[key: string]: IAMEPresetsTreeItem};
    userPresets: Array<IAMEPresetsTreeItem>;
    systemPresets: Array<IAMEPresetsTreeItem>;
}

export interface IAMEPresetsCache
{
    all: {[key: string]: IAMEPreset};
    allNormalized: {[key: string]: IAMEPreset};
    list: Array<IAMEPreset>;
}

export enum AMEPresetsTreeItemType
{
    Preset = 0,
    Folder = 1
}

export interface IAMEPresetsTreeItem
{
    itemType: AMEPresetsTreeItemType;
    itemTypeText: string;
    comment: string;

    isFolder: boolean;
    isExpanded?: boolean; // boolean "true" or "false" - tells if the node is expanded in AME
    folderState?: string;

    targetRate?: string; // "XX Mbps"
    fps?: string; // "XX fps"
    frameSize?: string; // resolution
    presetType?: any;
    folderZName: string;
    formatName: string;
    name: string;
    subList?: Array<IAMEPresetsTreeItem>;
    preset?: IAMEPreset;
    //
    toolTipSummary: string;
    icon?: string;
}

export interface IAMEPreset
{
    id: string;
    path: string;
    fileType: string;
    classId: string;
    name: string;    
    modifiedTime: string;
    folderDisplayPath: string;
    displayName?: string; // derived
}
