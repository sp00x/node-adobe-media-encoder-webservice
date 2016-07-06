/// <reference path="../typings/main.d.ts" />
import q = require('q');
export declare class AMEPresetsReader {
    static normalizePresetName(pn: string): string;
    static loadCache(path: string): q.Promise<IAMEPresetsCache>;
    static _loadCacheKeys(parentKeyNode: any, cache: IAMEPresetsCache): void;
    static loadTree(path: string): q.Promise<IAMEPresetsTree>;
    private static _loadPresetsTree(parentNode, tree, sort?, parentPath?);
}
export interface IAMEPresetsTree {
    all: {
        [key: string]: IAMEPresetsTreeItem;
    };
    allNormalized: {
        [key: string]: IAMEPresetsTreeItem;
    };
    userPresets: Array<IAMEPresetsTreeItem>;
    systemPresets: Array<IAMEPresetsTreeItem>;
}
export interface IAMEPresetsCache {
    all: {
        [key: string]: IAMEPreset;
    };
    allNormalized: {
        [key: string]: IAMEPreset;
    };
    list: Array<IAMEPreset>;
}
export declare enum AMEPresetsTreeItemType {
    Preset = 0,
    Folder = 1,
}
export interface IAMEPresetsTreeItem {
    itemType: AMEPresetsTreeItemType;
    itemTypeText: string;
    comment: string;
    isFolder: boolean;
    isExpanded?: boolean;
    folderState?: string;
    targetRate?: string;
    fps?: string;
    frameSize?: string;
    presetType?: any;
    folderZName: string;
    formatName: string;
    name: string;
    subList?: Array<IAMEPresetsTreeItem>;
    preset?: IAMEPreset;
    toolTipSummary: string;
    icon?: string;
}
export interface IAMEPreset {
    id: string;
    path: string;
    fileType: string;
    classId: string;
    name: string;
    modifiedTime: string;
    folderDisplayPath: string;
    displayName?: string;
}
