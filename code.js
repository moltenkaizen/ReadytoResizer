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
        const { customFrameName } = msg;
        try {
            const selection = figma.currentPage.selection;
            const imageNodes = filterImageNodes(selection);
            if (imageNodes.length === 0) {
                figma.notify('Please select at least one image');
                return;
            }
            const framedNodes = [];
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
                    const frame = figma.createFrame();
                    frame.name = customFrameName || imageNode.name;
                    frame.resize(originalWidth, originalHeight);
                    frame.fills = [];
                    frame.x = originalX;
                    frame.y = originalY;
                    frame.lockAspectRatio();
                    frame.appendChild(imageNode);
                    imageNode.x = 0;
                    imageNode.y = 0;
                    imageNode.constraints = {
                        horizontal: 'STRETCH',
                        vertical: 'STRETCH'
                    };
                    framedNodes.push(frame);
                    successCount++;
                }
                catch (error) {
                    console.error(`Error processing image ${i + 1}:`, error);
                    errorCount++;
                }
            }
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
