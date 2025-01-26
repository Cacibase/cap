const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    console.log("Navigating to Capital One...");
    await page.goto("https://capitalone.com", { waitUntil: "networkidle2" });

    // Perform actions on the page
    console.log("Page title:", await page.title());

    
    // Type login details and attempt login
    await page.type('input#ods-input-0', email);
    await page.type('input#ods-input-1', password);

    await page.evaluate(() => {
      const button = document.querySelector('button#noAcctSubmit');
      if (button) button.click();
    });


    await browser.close();
    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Error during Puppeteer session:", error);
  }
})();