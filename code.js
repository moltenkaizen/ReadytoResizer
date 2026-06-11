"use strict";
// Reject impossible dates/times (e.g. month 13, hour 25) so digit runs in
// unrelated names are less likely to parse as timestamps
function toValidTimestamp(year, month, day, hour, minute, second) {
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return null;
    if (hour > 23 || minute > 59 || second > 59)
        return null;
    return new Date(year, month - 1, day, hour, minute, second).getTime();
}
// Parse timestamp from common screenshot naming patterns
function parseTimestampFromName(name) {
    // macOS: "Screenshot 2024-02-03 at 10.15.30" or "... at 1.05.30 PM"
    // (12-hour locales; modern macOS puts a narrow no-break space U+202F
    // before AM/PM, which \s matches)
    const macosMatch = name.match(/(\d{4})-(\d{2})-(\d{2}) at (\d{1,2})\.(\d{2})\.(\d{2})(?:\s?(AM|PM))?/i);
    if (macosMatch) {
        const [, year, month, day, hour, minute, second, meridiem] = macosMatch;
        let hour24 = parseInt(hour);
        if (meridiem) {
            const isPM = meridiem.toUpperCase() === 'PM';
            if (isPM && hour24 !== 12)
                hour24 += 12;
            else if (!isPM && hour24 === 12)
                hour24 = 0;
        }
        const ts = toValidTimestamp(parseInt(year), parseInt(month), parseInt(day), hour24, parseInt(minute), parseInt(second));
        if (ts !== null)
            return ts;
    }
    // Android: "Screenshot_20240203-101530" or "Screenshot_20240203_101530"
    // (boundaries so digits embedded in longer runs don't match)
    const androidMatch = name.match(/(?:^|\D)(\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})(?!\d)/);
    if (androidMatch) {
        const [, year, month, day, hour, minute, second] = androidMatch;
        const ts = toValidTimestamp(parseInt(year), parseInt(month), parseInt(day), parseInt(hour), parseInt(minute), parseInt(second));
        if (ts !== null)
            return ts;
    }
    // ISO-like: "2024-02-03-10-15-30"
    const isoMatch = name.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const [, year, month, day, hour, minute, second] = isoMatch;
        const ts = toValidTimestamp(parseInt(year), parseInt(month), parseInt(day), parseInt(hour), parseInt(minute), parseInt(second));
        if (ts !== null)
            return ts;
    }
    // Windows Snipping Tool: "Screenshot 2024-02-03 101530"
    const windowsMatch = name.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})(?!\d)/);
    if (windowsMatch) {
        const [, year, month, day, hour, minute, second] = windowsMatch;
        const ts = toValidTimestamp(parseInt(year), parseInt(month), parseInt(day), parseInt(hour), parseInt(minute), parseInt(second));
        if (ts !== null)
            return ts;
    }
    // Shottr: "SCR-20240203-xxxx" — date only, parsed as midnight; the
    // time-encoded suffix makes the alphabetical tiebreak preserve
    // same-day order
    const shottrMatch = name.match(/SCR-(\d{4})(\d{2})(\d{2})(?!\d)/);
    if (shottrMatch) {
        const [, year, month, day] = shottrMatch;
        const ts = toValidTimestamp(parseInt(year), parseInt(month), parseInt(day), 0, 0, 0);
        if (ts !== null)
            return ts;
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
// Set after the plugin changes the selection itself, to suppress the
// resulting selectionchange event. Compared against the actual selection
// because Figma coalesces events: a quick user change can merge with the
// plugin-triggered one, and that merged event must NOT be suppressed.
let pluginSetSelectionKey = null;
function selectionKey(nodes) {
    return nodes.map(n => n.id).sort().join(',');
}
// Always show UI when plugin is launched
try {
    figma.showUI(__html__, { width: 320, height: 300, themeColors: true });
    // Listen for selection changes
    figma.on('selectionchange', () => {
        if (pluginSetSelectionKey !== null) {
            const isPluginChange = selectionKey(figma.currentPage.selection) === pluginSetSelectionKey;
            pluginSetSelectionKey = null;
            if (isPluginChange)
                return;
        }
        sendSelectionToUI();
    });
}
catch (error) {
    console.error('Error showing UI:', error);
    figma.closePlugin('Error starting plugin. Please try again.');
}
// Handle messages from the UI
figma.ui.onmessage = (msg) => {
    if (msg.type === 'ui-ready' || msg.type === 'get-selection') {
        sendSelectionToUI();
    }
    if (msg.type === 'resize') {
        figma.ui.resize(320, Math.max(220, Math.min(600, Math.round(msg.height))));
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
            let alreadyFramedCount = 0;
            for (let i = 0; i < imageNodes.length; i++) {
                const imageNode = imageNodes[i];
                try {
                    // Skip locked nodes
                    if (imageNode.locked) {
                        console.warn(`Skipping locked node: ${imageNode.name}`);
                        skippedCount++;
                        continue;
                    }
                    // Skip images already framed by this plugin (re-framing would
                    // nest a second wrapper frame around them)
                    if (imageNode.parent && imageNode.parent.type === 'FRAME' &&
                        imageNode.parent.getPluginData('readyToResizer') !== '') {
                        alreadyFramedCount++;
                        continue;
                    }
                    const originalX = imageNode.x;
                    const originalY = imageNode.y;
                    const originalWidth = imageNode.width;
                    const originalHeight = imageNode.height;
                    const originalRotation = imageNode.rotation;
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
                    // Transfer rotation to the frame (after x/y: rotating keeps x/y
                    // fixed); the image is un-rotated inside so it fills the frame
                    // instead of being clipped by an unrotated one (verified empirically)
                    frame.rotation = originalRotation;
                    frame.lockAspectRatio();
                    frame.setPluginData('readyToResizer', 'frame');
                    // Insert frame into the same parent to preserve position within Sections/Groups
                    if (parent && 'insertChild' in parent && parentIndex !== -1) {
                        parent.insertChild(parentIndex, frame);
                    }
                    frame.appendChild(imageNode);
                    imageNode.rotation = 0;
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
            // Arrange horizontally if requested. x/y are parent-relative, so
            // arranging across different parents would mix coordinate spaces;
            // inside auto-layout parents setting x/y is a silent no-op.
            // Compare parents by id: the API may return a fresh wrapper object for
            // the same node on each .parent access, so object identity is unreliable
            const parentIds = new Set(framedData.map(d => d.frame.parent ? d.frame.parent.id : ''));
            const sharedParent = parentIds.size === 1 ? framedData[0].frame.parent : null;
            let arrangementSkipped = null;
            if (arrangeHorizontally && framedData.length > 0 && !sharedParent) {
                arrangementSkipped = 'images are in different containers';
            }
            else if (arrangeHorizontally && framedData.length > 0 &&
                sharedParent && 'layoutMode' in sharedParent && sharedParent.layoutMode !== 'NONE') {
                arrangementSkipped = 'the parent frame uses auto layout, which controls positions';
            }
            else if (arrangeHorizontally && framedData.length > 0) {
                // Sort by timestamp (with fallback to alphabetical)
                framedData.sort((a, b) => {
                    const timeA = parseTimestampFromName(a.originalName);
                    const timeB = parseTimestampFromName(b.originalName);
                    // Both have timestamps - sort by time, alphabetical tiebreak
                    // (date-only formats like Shottr parse to midnight, and their
                    // time-encoded suffixes sort chronologically)
                    if (timeA !== null && timeB !== null) {
                        return timeA - timeB || a.originalName.localeCompare(b.originalName);
                    }
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
                pluginSetSelectionKey = selectionKey(framedNodes);
            }
            if (successCount > 0) {
                let message = `Framed ${successCount} image(s)`;
                const details = [];
                if (skippedCount > 0) {
                    details.push(`${skippedCount} locked`);
                }
                if (alreadyFramedCount > 0) {
                    details.push(`${alreadyFramedCount} already framed`);
                }
                if (errorCount > 0) {
                    details.push(`${errorCount} failed`);
                }
                if (arrangementSkipped) {
                    details.push(`arrangement skipped: ${arrangementSkipped}`);
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
                    skippedCount: skippedCount,
                    alreadyFramedCount: alreadyFramedCount,
                    arrangementSkipped: arrangementSkipped
                });
            }
            else if (alreadyFramedCount > 0 && errorCount === 0) {
                figma.notify('Selected image(s) are already framed by this plugin');
                figma.ui.postMessage({
                    type: 'framing-skipped',
                    alreadyFramedCount: alreadyFramedCount
                });
            }
            else {
                figma.notify('Failed to frame images. Check console for details.', { error: true });
            }
        }
        catch (error) {
            console.error('Error in frame-images process:', error);
            figma.notify('Error framing images. Check console for details.', { error: true });
        }
    }
};
