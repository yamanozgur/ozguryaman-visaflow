import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'users.json');

// LAZY FIREBASE INITIALIZATION
let dbInstance = null;
let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return dbInstance;

  const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountStr) {
    console.log('FIREBASE_SERVICE_ACCOUNT environment variable is not set. Using local users.json for ephemeral/demo storage.');
    firebaseInitialized = true;
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountStr);
    const firebaseApp = initializeApp({
      credential: cert(serviceAccount)
    });
    dbInstance = getFirestore(firebaseApp);
    console.log('Firebase Admin SDK and Cloud Firestore initialized successfully! ☁️');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
  }

  firebaseInitialized = true;
  return dbInstance;
}

// Helper to read local users database (ephemeral fallback)
function readUsers() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '{}');
  } catch (error) {
    console.error('Error reading users database:', error);
    return {};
  }
}

// Helper to write local users database (ephemeral fallback)
function writeUsers(users) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error writing users database:', error);
  }
}

// Fetch user data from either Firestore or local fallback
async function getUserByEmail(email) {
  const key = email.toLowerCase().trim();
  const db = initFirebase();
  if (db) {
    try {
      const docRef = db.collection('users').doc(key);
      const doc = await docRef.get();
      if (doc.exists) {
        return doc.data();
      }
      return null;
    } catch (error) {
      console.error(`Error fetching user ${key} from Firestore, falling back to local storage:`, error);
    }
  }

  const users = readUsers();
  return users[key] || null;
}

// Save user data to either Firestore or local fallback
async function saveUser(email, userData) {
  const key = email.toLowerCase().trim();
  const db = initFirebase();
  if (db) {
    try {
      const docRef = db.collection('users').doc(key);
      await docRef.set(userData, { merge: true });
      return;
    } catch (error) {
      console.error(`Error saving user ${key} to Firestore, falling back to local storage:`, error);
    }
  }

  const users = readUsers();
  users[key] = userData;
  writeUsers(users);
}

// REGISTER ENDPOINT
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const key = email.toLowerCase().trim();
    const existingUser = await getUserByEmail(key);

    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const newUser = {
      email: key,
      password: password, // Simple password storage for simulation/onboarding
      name: name || 'Explorer',
      isPremium: false,
      state: null
    };

    await saveUser(key, newUser);
    res.json({ message: 'Registration successful!', user: { email: key, name: newUser.name, isPremium: false } });
  } catch (error) {
    console.error('Error in register endpoint:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// LOGIN ENDPOINT
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const key = email.toLowerCase().trim();
    const user = await getUserByEmail(key);

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json({
      message: 'Login successful!',
      user: { email: key, name: user.name, isPremium: user.isPremium },
      state: user.state
    });
  } catch (error) {
    console.error('Error in login endpoint:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// SYNC STATE ENDPOINT
app.post('/api/sync', async (req, res) => {
  try {
    const { email, state } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Authentication required to sync.' });
    }

    const key = email.toLowerCase().trim();
    const user = await getUserByEmail(key);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Update state
    user.state = state;
    if (state && state.user) {
      user.name = state.user.name || user.name;
      user.isPremium = state.user.isPremium || user.isPremium;
    }

    await saveUser(key, user);
    res.json({ message: 'Data synced successfully!', isPremium: user.isPremium });
  } catch (error) {
    console.error('Error in sync endpoint:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// UPGRADE TO PREMIUM (SIMULATED GOOGLE PLAY PURCHASE SUCCESS)
app.post('/api/upgrade', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Authentication required to upgrade.' });
    }

    const key = email.toLowerCase().trim();
    const user = await getUserByEmail(key);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.isPremium = true;
    if (user.state && user.state.user) {
      user.state.user.isPremium = true;
    }

    await saveUser(key, user);
    res.json({ message: 'Successfully upgraded to Premium!', isPremium: true });
  } catch (error) {
    console.error('Error in upgrade endpoint:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET DATABASE & FIREBASE STATUS
app.get('/api/status', (req, res) => {
  res.json({
    firebaseEnabled: !!process.env.FIREBASE_SERVICE_ACCOUNT
  });
});

// Send index.html for all other routes to support client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
