import { useState } from 'react';
import API from '../api';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const nav = useNavigate();

  const handleRegister = async () => {
    await API.post('/auth/register', form);
    nav('/login');
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl mb-4">Register</h2>
      <input onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" className="border w-full mb-2 p-2" />
      <input onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" className="border w-full mb-2 p-2" />
      <input type="password" onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Password" className="border w-full mb-4 p-2" />
      <button onClick={handleRegister} className="bg-blue-700 text-white px-4 py-2">Register</button>
    </div>
  );
}
