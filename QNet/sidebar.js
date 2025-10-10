/* @tweakable sidebar width in pixels when open */
const sidebarWidthPx = 260;
/* @tweakable sidebar starts open in editor */
const sidebarDefaultOpen = false;
/* @tweakable dock the editor sidebar to 'right' or 'left' */
const sidebarSide = 'right';
/* @tweakable default sidebar file name shown at the top */
const defaultFileName = "z.qnet";
/* @tweakable max length for the sidebar file name */
const filenameMaxLength = 64;
/* @tweakable max length for the sidebar description */
const descriptionMaxLength = 86;
/* @tweakable placeholder text for the sidebar description */
const descriptionPlaceholder = "Describe this project or file...";
/* @tweakable list of files to show in the sidebar dropdown (order matters) */
const sidebarFiles = ["index.html", "styles.css", "script.js", "README.md"];
/* @tweakable amount of sidebar visible when closed (px). Set to 0 to hide completely */
const sidebarHiddenPeekPx = 0;
/* @tweakable sidebar border style to use when sidebar is hidden (e.g. '0' or 'none') */
const sidebarHiddenBorder = '0';
/* @tweakable pointer-events value to apply to the sidebar when hidden (use 'none' to prevent any interaction) */
const sidebarHiddenPointerEvents = 'none';
const sidebarMinWidth = 200, sidebarMaxWidth = 640;

export { initSidebar, ensureResizer, getEditorSidebar } from './sidebar/initSidebar.js';
export { buildSidebarHeader, rebuildSidebarForProject } from './sidebar/header.js';