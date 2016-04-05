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

export class AMEPresetsTreeReader
{
    static load(path: string): q.Promise<any>
    {
        const d = q.defer<any>();

        fs.readFile(path, (err: any, data: any) =>
        {
            if (err) return d.reject(err);

            const xml: string = data.toString('utf-8');
            const x: any = xml2js.parseString(xml, (err: any, result: any) =>
            {
                const registry: any = {};
                const list: any = {
                    all: registry,
                    userPresets: AMEPresetsTreeReader._loadPresetsTree(result.PremiereData.UserPresets, registry, true),
                    systemPresets: AMEPresetsTreeReader._loadPresetsTree(result.PremiereData.SystemPresets, registry, true)
                };

                d.resolve(list);
            });
        });

        return d.promise;
    }

    private static _loadPresetsTree(parentNode: any, registry: any, sort: boolean = true, parentPath: string = ""): Array<IAMEPresetsTreeItem>
    {
        if (parentNode == null || parentNode.Length == 0) return null;

        const items: IAMEPresetsTreeItem[] = parentNode[0].PresetsUIItem.map((it: any) =>
        {
            const i: IAMEPresetsTreeItem = <IAMEPresetsTreeItem>{
                name: xmlValue(it.Name),
                isFolder: false,
                itemTypeText: xmlValue(it.ItemType),
                itemType: xmlValue(it.ItemType) == "0" ? AMEPresetsTreeItemType.Preset : AMEPresetsTreeItemType.Folder,
                toolTipSummary: xmlValue(it.ToolTipSum),
                comment: xmlValue(it.Comment),
                targetRate: xmlValue(it.TRate),
                fps: xmlValue(it.FPS),
                frameSize: xmlValue(it.FSize),
                presetType: xmlValue(it.PresetType), // ?
                folderZName: xmlValue(it.FolderZName),
                formatName: xmlValue(it.FormatName)
            };

            if (i.itemType == AMEPresetsTreeItemType.Folder)
            {
                i.isFolder = true;
                i.isExpanded = xmlValue(it.FolderState) == "true";
                i.folderState = xmlValue(it.FolderState);
            }

            if (it.ProxyPreset != null && it.ProxyPreset.length > 0)
            {
                i.preset = <IAMEPreset>{
                    path: xmlValue(it.ProxyPreset[0].PresetPath),
                    fileType: xmlValue(it.ProxyPreset[0].PresetFileType),
                    id: xmlValue(it.ProxyPreset[0].PresetID),
                    classId: xmlValue(it.ProxyPreset[0].PresetClassID),
                    name: xmlValue(it.ProxyPreset[0].PresetName),
                    modifiedTime: xmlValue(it.ProxyPreset[0].PresetModifiedTime),
                    folderDisplayPath: xmlValue(it.ProxyPreset[0].FolderDisplayPath)
                }
            }

            const presetPath = path.posix.join(parentPath, i.name);

            if (!i.isFolder)
                registry[presetPath] = i;

            if (it.SubList != null)
                i.subList = AMEPresetsTreeReader._loadPresetsTree(it.SubList, registry, sort, presetPath);

            return i;
        });

        if (sort) items.sort((a: IAMEPresetsTreeItem, b: IAMEPresetsTreeItem) =>
        {
            return a.name.localeCompare(b.name);
        })

        return items;
    }
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
    path: string;
    fileType: string;
    classId: string;
    name: string;
    modifiedTime: string;
    folderDisplayPath: string;
}
