/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
    cacheDirectory: '/app/.cache/puppeteer', // Ensure Puppeteer uses the correct cache path
    browsers: {
      chrome: {
        skipDownload: false, // Force Puppeteer to download Chrome
      },
    },
  };