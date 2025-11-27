// Type definition for messages from the UI
type UIMessage =
  | { type: 'ui-ready' }
  | { type: 'get-selection' }
  | { type: 'frame-images'; customFrameName?: string };

// Filter nodes to find rectangles with image fills
function filterImageNodes(nodes: readonly SceneNode[]): RectangleNode[] {
  return nodes.filter((node): node is RectangleNode => {
    return node.type === 'RECTANGLE' &&
           Array.isArray(node.fills) &&
           node.fills.some(fill => fill.type === 'IMAGE');
  });
}

// Function to get current selection data
function getSelectionData(): { count: number; hasImages: boolean } {
  const selection = figma.currentPage.selection;
  const imageNodes = filterImageNodes(selection);

  return {
    count: imageNodes.length,
    hasImages: imageNodes.length > 0
  };
}

// Function to send selection data to UI
function sendSelectionToUI(): void {
  try {
    const selectionData = getSelectionData();

    figma.ui.postMessage({
      type: 'selection-data',
      count: selectionData.count,
      hasImages: selectionData.hasImages
    });
  } catch (error) {
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

} catch (error) {
  console.error('Error showing UI:', error);
  figma.closePlugin('Error starting plugin. Please try again.');
}

// Handle messages from the UI
figma.ui.onmessage = async (msg: UIMessage) => {
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

      const framedNodes: FrameNode[] = [];
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < imageNodes.length; i++) {
        const imageNode = imageNodes[i];

        try {
          // Skip locked nodes
          if (imageNode.locked) {
            console.warn(`Skipping locked node: ${imageNode.name}`);
            errorCount++;
            continue;
          }

          const originalX = imageNode.x;
          const originalY = imageNode.y;
          const originalWidth = imageNode.width;
          const originalHeight = imageNode.height;

          const frame = figma.createFrame();
          frame.name = customFrameName || `Frame - ${imageNode.name}`;
          frame.resize(originalWidth, originalHeight);
          frame.fills = [];
          frame.x = originalX;
          frame.y = originalY;

          frame.appendChild(imageNode);
          imageNode.x = 0;
          imageNode.y = 0;
          imageNode.constraints = {
            horizontal: 'STRETCH',
            vertical: 'STRETCH'
          };

          framedNodes.push(frame);
          successCount++;

        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error);
          errorCount++;
        }
      }

      if (framedNodes.length > 0) {
        figma.currentPage.selection = framedNodes;
      }

      if (successCount > 0) {
        const message = errorCount > 0
          ? `Framed ${successCount} image(s) (${errorCount} failed)`
          : `Framed ${successCount} image(s) - ready to resize!`;
        figma.notify(message);

        // Send success message to UI
        figma.ui.postMessage({
          type: 'framing-success',
          successCount: successCount,
          errorCount: errorCount
        });
      } else {
        figma.notify('Failed to frame images. Check console for details.');
      }

    } catch (error) {
      console.error('Error in frame-images process:', error);
      figma.notify('Error framing images. Check console for details.');
    }
  }
};