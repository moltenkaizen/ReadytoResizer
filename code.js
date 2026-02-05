"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Parse timestamp from common screenshot naming patterns
function parseTimestampFromName(name) {
    // macOS/iOS: "Screenshot 2024-02-03 at 10.15.30"
    const macosMatch = name.match(/(\d{4})-(\d{2})-(\d{2}) at (\d{1,2})\.(\d{2})\.(\d{2})/);
    if (macosMatch) {
        const [, year, month, day, hour, minute, second] = macosMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second)).getTime();
    }
    // Android: "Screenshot_20240203-101530" or "Screenshot_20240203_101530"
    const androidMatch = name.match(/(\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})/);
    if (androidMatch) {
        const [, year, month, day, hour, minute, second] = androidMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second)).getTime();
    }
    // ISO-like: "2024-02-03-10-15-30"
    const isoMatch = name.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const [, year, month, day, hour, minute, second] = isoMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second)).getTime();
    }
    return null;
}
// Filter nodes to find rectangles with image fills
function filterImageNodes(nodes) {
    return nodes.filter((node) => {
        return node.type === 'RECTANGLE' &&
            Array.isArray(node.fills) &&
            node.fills.some(fill => fill.type === 'IMAGE');
    });
}
// Function to get current selection data
function getSelectionData() {
    const selection = figma.currentPage.selection;
    const imageNodes = filterImageNodes(selection);
    return {
        count: imageNodes.length,
        hasImages: imageNodes.length > 0
    };
}
// Function to send selection data to UI
function sendSelectionToUI() {
    try {
        const selectionData = getSelectionData();
        figma.ui.postMessage({
            type: 'selection-data',
            count: selectionData.count,
            hasImages: selectionData.hasImages
        });
    }
    catch (error) {
        console.error('Error sending selection data:', error);
    }
}
// Always show UI when plugin is launched
try {
    figma.showUI(__html__, { width: 320, height: 300 });
    // Listen for selection changes
    figma.on('selectionchange', () => {
        sendSelectionToUI();
    });
}
catch (error) {
    console.error('Error showing UI:', error);
    figma.closePlugin('Error starting plugin. Please try again.');
}
// Handle messages from the UI
figma.ui.onmessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
    if (msg.type === 'ui-ready') {
        sendSelectionToUI();
    }
    if (msg.type === 'get-selection') {
        sendSelectionToUI();
    }
    if (msg.type === 'frame-images') {
        const { customFrameName, arrangeHorizontally } = msg;
        try {
            const selection = figma.currentPage.selection;
            const imageNodes = filterImageNodes(selection);
            if (imageNodes.length === 0) {
                figma.notify('Please select at least one image');
                return;
            }
            const framedData = [];
            let successCount = 0;
            let errorCount = 0;
            let skippedCount = 0;
            for (let i = 0; i < imageNodes.length; i++) {
                const imageNode = imageNodes[i];
                try {
                    // Skip locked nodes
                    if (imageNode.locked) {
                        console.warn(`Skipping locked node: ${imageNode.name}`);
                        skippedCount++;
                        continue;
                    }
                    const originalX = imageNode.x;
                    const originalY = imageNode.y;
                    const originalWidth = imageNode.width;
                    const originalHeight = imageNode.height;
                    const originalName = imageNode.name;
                    const parent = imageNode.parent;
                    const parentIndex = parent && 'children' in parent
                        ? parent.children.indexOf(imageNode)
                        : -1;
                    const frame = figma.createFrame();
                    frame.name = customFrameName || imageNode.name;
                    frame.resize(originalWidth, originalHeight);
                    frame.fills = [];
                    frame.x = originalX;
                    frame.y = originalY;
                    frame.lockAspectRatio();
                    // Insert frame into the same parent to preserve position within Sections/Groups
                    if (parent && 'insertChild' in parent && parentIndex !== -1) {
                        parent.insertChild(parentIndex, frame);
                    }
                    frame.appendChild(imageNode);
                    imageNode.x = 0;
                    imageNode.y = 0;
                    imageNode.constraints = {
                        horizontal: 'STRETCH',
                        vertical: 'STRETCH'
                    };
                    framedData.push({ frame, originalName });
                    successCount++;
                }
                catch (error) {
                    console.error(`Error processing image ${i + 1}:`, error);
                    errorCount++;
                }
            }
            // Arrange horizontally if requested
            if (arrangeHorizontally && framedData.length > 0) {
                // Sort by timestamp (with fallback to alphabetical)
                framedData.sort((a, b) => {
                    const timeA = parseTimestampFromName(a.originalName);
                    const timeB = parseTimestampFromName(b.originalName);
                    // Both have timestamps - sort by time
                    if (timeA !== null && timeB !== null)
                        return timeA - timeB;
                    // Only one has timestamp - timestamped first
                    if (timeA !== null)
                        return -1;
                    if (timeB !== null)
                        return 1;
                    // Neither has timestamp - sort alphabetically
                    return a.originalName.localeCompare(b.originalName);
                });
                // Position horizontally with 200px spacing
                const startY = framedData[0].frame.y;
                let currentX = framedData[0].frame.x;
                for (const { frame } of framedData) {
                    frame.x = currentX;
                    frame.y = startY;
                    currentX += frame.width + 200;
                }
            }
            const framedNodes = framedData.map(d => d.frame);
            if (framedNodes.length > 0) {
                figma.currentPage.selection = framedNodes;
            }
            if (successCount > 0) {
                let message = `Framed ${successCount} image(s)`;
                const details = [];
                if (skippedCount > 0) {
                    details.push(`${skippedCount} locked`);
                }
                if (errorCount > 0) {
                    details.push(`${errorCount} failed`);
                }
                if (details.length > 0) {
                    message += ` (${details.join(', ')})`;
                }
                else {
                    message += ' - ready to resize!';
                }
                figma.notify(message);
                // Send success message to UI
                figma.ui.postMessage({
                    type: 'framing-success',
                    successCount: successCount,
                    errorCount: errorCount,
                    skippedCount: skippedCount
                });
            }
            else {
                figma.notify('Failed to frame images. Check console for details.');
            }
        }
        catch (error) {
            console.error('Error in frame-images process:', error);
            figma.notify('Error framing images. Check console for details.');
        }
    }
});
