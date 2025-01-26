from flask import Flask, render_template, request, redirect, url_for
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time


# Flask app setup
app = Flask(__name__)

# Configuration
LOGIN_URL = "https://capitalone.com"

# Function to launch Firefox in private browsing mode
def launch_firefox():
    options = Options()
    options.add_argument("--private")  # Launch Firefox in private browsing mode
    driver = webdriver.Firefox(options=options)
    return driver




# Function to login to the website
def login_to_site(email, password):
    driver = None
    try:
        # Launch Firefox
        driver = launch_firefox()
        driver.get(LOGIN_URL)

        # Locate and click the "Sign In" button
        print("Locating and clicking the 'Sign In' button...")
        sign_in_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "unav-l1-signin"))
        )
        sign_in_button.click()

        # Wait for the new page to load
        print("Waiting for the page to load after clicking 'Sign In'...")
        time.sleep(5)  # Wait for 5 seconds to ensure the page has loaded

        # Locate and fill the username and password fields
        print("Locating and filling the username and password fields...")
        username_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "usernameInputField"))
        )
        password_input = driver.find_element(By.ID, "pwInputField")
        username_input.send_keys(email)
        password_input.send_keys(password)

        wait = WebDriverWait(driver, 10)  # Wait up to 10 seconds
        login_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[data-testtarget="sign-in-submit-button"]')))
        login_button.click()

        # Wait to check if login was successful
        print("Waiting to verify login success...")
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, '//h1[contains(text(), "Welcome back")]'))
            )
            print("Login successful!")
            return "Login successful!"
        except TimeoutException:
            print("Login failed.")
            return "Login failed. Please check your credentials."

    except Exception as e:
        print(f"An error occurred during login: {e}")
        return f"An error occurred: {e}"
    finally:
        if driver:
            driver.quit()

# Route to render the login page
@app.route('/')
def login_page():
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Login</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 400px;
                margin: 50px auto;
                text-align: center;
            }
            input, button {
                padding: 10px;
                margin: 10px 0;
                width: 100%;
                font-size: 16px;
            }
            button {
                background-color: #007bff;
                color: white;
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
        <form action="/submit-login" method="post">
            <input type="text" name="email" placeholder="Email" required /><br>
            <input type="password" name="password" placeholder="Password" required /><br>
            <button type="submit">Log in</button>
        </form>
    </body>
    </html>
    '''

# Route to handle form submission
@app.route('/submit-login', methods=['POST'])
def submit_login():
    # Get email and password from the form
    email = request.form.get('email')
    password = request.form.get('password')

    # Perform login using Selenium
    login_result = login_to_site(email, password)

    # Return the result of the login attempt
    return f'''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Login Result</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                max-width: 400px;
                margin: 50px auto;
                text-align: center;
            }}
            h1 {{
                color: {'green' if 'successful' in login_result else 'red'};
            }}
            button {{
                padding: 10px;
                margin: 20px 0;
                width: 100%;
                font-size: 16px;
                background-color: #007bff;
                color: white;
                border: none;
                cursor: pointer;
            }}
            button:hover {{
                background-color: #0056b3;
            }}
        </style>
    </head>
    <body>
        <h1>{login_result}</h1>
        <button onclick="window.location.href='/'">Go Back</button>
    </body>
    </html>
    '''

# Run the Flask app
if __name__ == '__main__':
    app.run(debug=True)