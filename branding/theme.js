"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultTheme = void 0;
exports.generateTheme = generateTheme;
const tslib_1 = require("tslib");
const tinycolor2_1 = tslib_1.__importDefault(require("tinycolor2"));
function generateColorVariations(defaultColor) {
    const defaultColorObj = (0, tinycolor2_1.default)(defaultColor);
    const darkColor = defaultColorObj.clone().darken(2);
    const baseLight = (0, tinycolor2_1.default)('#ffffff');
    const lightColor = tinycolor2_1.default
        .mix(baseLight, defaultColorObj.toHex(), 12)
        .toHexString();
    const mediumColor = defaultColorObj.clone().lighten(26);
    return {
        default: defaultColorObj.toHexString(),
        dark: darkColor.toHexString(),
        light: lightColor,
        medium: mediumColor.toHexString(),
    };
}
function generateSelectionColor(defaultColor) {
    const defaultColorObj = (0, tinycolor2_1.default)(defaultColor);
    const lightColor = defaultColorObj.lighten(8);
    return lightColor.toHexString();
}
function generateTheme({ primaryColor, fullLogoUrl, favIconUrl, logoIconUrl, websiteName, themeColors, }) {
    const primary = generateColorVariations(primaryColor);
    return {
        websiteName,
        colors: {
            avatar: themeColors?.avatar ?? '#515151',
            'blue-link': themeColors?.['blue-link'] ?? '#1890ff',
            danger: themeColors?.danger ?? '#f94949',
            primary: {
                default: primary.default,
                dark: themeColors?.primary?.dark ?? primary.dark,
                light: themeColors?.primary?.light ?? primary.light,
                medium: themeColors?.primary?.medium ?? primary.medium,
            },
            warn: {
                default: themeColors?.warn?.default ?? '#f78a3b',
                light: themeColors?.warn?.light ?? '#fff6e4',
                dark: themeColors?.warn?.dark ?? '#cc8805',
            },
            success: {
                default: themeColors?.success?.default ?? '#14ae5c',
                light: themeColors?.success?.light ?? '#3cad71',
            },
            selection: themeColors?.selection ?? generateSelectionColor(primaryColor),
        },
        logos: {
            fullLogoUrl,
            favIconUrl,
            logoIconUrl,
        },
    };
}
exports.defaultTheme = generateTheme({
    primaryColor: '#00D4FF',
    websiteName: 'Aethersy',
    fullLogoUrl: '/brand/full-logo.png',
    favIconUrl: '/favicon.ico',
    logoIconUrl: '/brand/logo.png',
    themeColors: {
        'blue-link': '#4DEEFF',
    },
});
//# sourceMappingURL=theme.js.map