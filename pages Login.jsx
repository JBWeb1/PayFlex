import { useState } from 'react';
import API from '../api';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const nav = useNavigate();

  const handleLogin = async () => {
    const res = await API.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    nav('/');
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl mb-4">Login</h2>
      <input onChange={e => setEmail(e.target.value)} placeholder="Email" className="border w-full mb-2 p-2" />
      <input type="password" onChange={e => setPassword(e.target.value)} placeholder="Password" className="border w-full mb-4 p-2" />
      <button onClick={handleLogin} className="bg-blue-700 text-white px-4 py-2">Login</button>
    </div>
  );
}
