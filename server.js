import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'users.json');

// Helper to read users database
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

// Helper to write users database
function writeUsers(users) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error writing users database:', error);
  }
}

// REGISTER ENDPOINT
app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const key = email.toLowerCase().trim();
  const users = readUsers();

  if (users[key]) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  users[key] = {
    email: key,
    password: password, // For simulation/dev testing purposes, stored simply
    name: name || 'Explorer',
    isPremium: false,
    state: null
  };

  writeUsers(users);
  res.json({ message: 'Registration successful!', user: { email: key, name: users[key].name, isPremium: false } });
});

// LOGIN ENDPOINT
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const key = email.toLowerCase().trim();
  const users = readUsers();
  const user = users[key];

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.json({
    message: 'Login successful!',
    user: { email: key, name: user.name, isPremium: user.isPremium },
    state: user.state
  });
});

// SYNC STATE ENDPOINT
app.post('/api/sync', (req, res) => {
  const { email, state } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Authentication required to sync.' });
  }

  const key = email.toLowerCase().trim();
  const users = readUsers();
  const user = users[key];

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Update server state with client state
  user.state = state;
  // Sync name or premium status if they match
  if (state && state.user) {
    user.name = state.user.name || user.name;
    user.isPremium = state.user.isPremium || user.isPremium;
  }

  writeUsers(users);
  res.json({ message: 'Data synced successfully!', isPremium: user.isPremium });
});

// UPGRADE TO PREMIUM (SIMULATED GOOGLE PLAY PURCHASE SUCCESS)
app.post('/api/upgrade', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Authentication required to upgrade.' });
  }

  const key = email.toLowerCase().trim();
  const users = readUsers();
  const user = users[key];

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.isPremium = true;
  if (user.state && user.state.user) {
    user.state.user.isPremium = true;
  }

  writeUsers(users);
  res.json({ message: 'Successfully upgraded to Premium!', isPremium: true });
});

// Send index.html for all other routes to support client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
