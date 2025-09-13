// src/utils/adf-parser.js
/**
 * Recursively extracts plain text from a Jira ADF document.
 * @param {object} adf The ADF JSON content.
 * @returns {string} The extracted plain text.
 */
export const extractPlainTextFromAdf = (adf, finalImageUrls) => {
    if (!adf || typeof adf !== 'object' || !Array.isArray(adf.content)) {
        return '';
    }

    let text = '';
    for (const node of adf.content) {
        if (node.type === 'paragraph' && Array.isArray(node.content)) {
            for (const pContent of node.content) {
                if (pContent.type === 'text') {
                    text += pContent.text;
                }
            }
            text += '\n'; // Add newline after each paragraph
        } else if (node.type === 'heading' && Array.isArray(node.content)) {
            for (const hContent of node.content) {
                if (hContent.type === 'text') {
                    text += `# ${hContent.text}\n`; // Markdown for heading
                }
            }
        } else if (node.type === 'bulletList' && Array.isArray(node.content)) {
            for (const listItem of node.content) {
                if (listItem.type === 'listItem' && Array.isArray(listItem.content)) {
                    text += '- ' + extractPlainTextFromAdf({ content: listItem.content }, finalImageUrls) + '\n';
                }
            }
        } else if (node.type === 'mediaSingle' && Array.isArray(node.content)) {
             // For media, add a placeholder or URL if available
             const mediaNode = node.content.find(c => c.type === 'media');
             const match = finalImageUrls.find(img => img.filename === mediaNode.attrs.alt);
            if (mediaNode && mediaNode.attrs && mediaNode.attrs.alt) {
                if (match) {
                    text += `\n![Image: ${mediaNode.attrs.alt}, url: (${match.url})]\n`;
                } else {
                    text += `![Image: ${mediaNode.attrs.alt || 'attachment'}]\n`;
                }
            } else {
                 text += '[Image inserted]\n';
             }
        }
        // Add other ADF types as needed (e.g., strong, em, codeBlock, panel, table)
    }
    return text.trim();
};