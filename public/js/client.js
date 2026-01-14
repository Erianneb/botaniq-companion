// public/js/client.js

document.addEventListener('DOMContentLoaded', () => {
    // DEFINE SECTIONS AND FORMS
    const loginForm = document.getElementById('login-form');
    const toggleCreateBtn = document.getElementById('toggle-create-btn');
    const displaySection = document.getElementById('session-code-display');
    const sessionLoginSection = document.getElementById('session-login');
    
    const createAccountSection = document.getElementById('create-account-form');
    const creationForm = document.getElementById('creation-form');
    const backToLoginBtn = document.getElementById('back-to-login-btn');


    // --- GENERAL API HANDLER (Handles submission and UI update) ---
    const handleAccountAction = async (endpoint, data, isCreation) => {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                const sessionCode = result.session_code;
                const isSurveyDone = result.survey_completed; 

                // Logic to handle if the survey is already completed
                if (isSurveyDone === 1) {
                    alert('Welcome back! Your survey is already completed. Thank you for your participation.');
                    
                    // Show a final thank you message instead of the session code box
                    document.getElementById('session-code-display').innerHTML = 
                        '<h2>Session Complete!</h2><p>Thank you for participating. All data has been collected.</p>';
                    
                    // Hide forms and show the completion message
                    sessionLoginSection.style.display = 'none';
                    createAccountSection.style.display = 'none';
                    displaySection.style.display = 'block';

                } else {
                    // Normal Flow: Survey is NOT done, display the Session Code for VR
                    document.getElementById('session-code').textContent = sessionCode; 
                    localStorage.setItem('botaniq_session_code', sessionCode); // Save code

                    // Hide forms and show the code box
                    sessionLoginSection.style.display = 'none';
                    createAccountSection.style.display = 'none';
                    displaySection.style.display = 'block';

                    const actionMessage = isCreation ? 'Account created and session started!' : 'Login successful, session resumed!';
                    alert(actionMessage + ' Your code is ready for VR.');
                }

            } else {
                alert(`Operation failed: ${result.message}`);
            }
        } catch (error) {
            console.error('System error:', error);
            alert('Connection error. Ensure the Node.js server is running.');
        }
    };

    // Handler function for the Login form submission
    const loginHandler = (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        handleAccountAction('/api/session/login', { username, password }, false); 
    };
    
    // Handler function for the Creation form submission
    const creationHandler = (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        handleAccountAction('/api/session/create', { username, password }, true);
    };


    // --- 3. EVENT LISTENERS (UI FLOW LOGIC) ---
    
    // A. LOGIN LOGIC (Initial state)
    if (loginForm) {
        loginForm.addEventListener('submit', loginHandler);
    }
    
    // B. TOGGLE TO CREATE ACCOUNT (Show creation form)
    if (toggleCreateBtn) {
        toggleCreateBtn.addEventListener('click', () => {
            sessionLoginSection.style.display = 'none'; // Hide Login form
            createAccountSection.style.display = 'block'; // Show Creation form
        });
    }

    // C. CREATE ACCOUNT SUBMIT (I-attach the handler)
    if (creationForm) {
        creationForm.addEventListener('submit', creationHandler);
    }

    // D. BACK BUTTON (Return to Login screen)
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', () => {
            createAccountSection.style.display = 'none'; // Hide Creation form
            sessionLoginSection.style.display = 'block'; // Show Login form
        });
    }


    // E. PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered.'))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }
});