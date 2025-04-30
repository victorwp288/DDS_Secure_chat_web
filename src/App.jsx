import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';
import HomePage from './pages/HomePage'; // Import the HomePage
import SignupPage from './pages/SignupPage'; // Import the SignupPage
import SettingsPage from './pages/SettingsPage'; // Import the SettingsPage
import ProfilePage from './pages/ProfilePage'; // Import the ProfilePage
import LoginPage from './pages/LoginPage'; // Import the LoginPage
import ForgotPasswordPage from './pages/ForgotPasswordPage'; // Import the ForgotPasswordPage
import ChatPage from './pages/ChatPage'; // Import the ChatPage
import CryptoTestPage from './pages/CryptoTestPage'; // Import the CryptoTestPage
import AboutPage from './pages/AboutPage'; // Import the AboutPage

function App() {
  return (
    <Router> {/* Wrap everything in the Router */}
      <Routes> {/* Define routes */}
        <Route path="/" element={<HomePage />} /> 
        <Route path="/crypto-test" element={<CryptoTestPage />} /> 
        <Route path="/signup" element={<SignupPage />} /> 
        <Route path="/settings" element={<SettingsPage />} /> 
        <Route path="/profile" element={<ProfilePage />} /> 
        <Route path="/login" element={<LoginPage />} /> 
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/chat" element={<ChatPage />} /> 
        <Route path="/about" element={<AboutPage />} />
        {/* Add other routes here later, e.g.: */}
        {/* <Route path="/about" element={<AboutPage />} /> */}
      </Routes>
    </Router>
  );
}

export default App;
