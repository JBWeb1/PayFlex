import { useState } from 'react';
import API from '../api';

export default function CreatePayment() {
  const [amount, setAmount] = useState('');
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');

  const handleCreate = async () => {
    const res = await API.post('/payment/create', {
      amount,
      callbackURL: 'http://localhost:3000/paid'
    }, {
      headers: { token: localStorage.getItem('token') }
    });
    setLink(res.data.link);
    setQr(res.data.qr);
  };

  return (
    <div className="p-4">
      <h2 className="text-xl">Create a Payment</h2>
      <input placeholder="Amount" onChange={e => setAmount(e.target.value)} className="border p-2 w-full my-2" />
      <button onClick={handleCreate} className="bg-green-600 text-white px-4 py-2">Generate</button>

      {qr && <div className="mt-4">
        <img src={qr} alt="QR Code" />
        <p><a href={link} className="text-blue-600 underline">Open Payment Link</a></p>
      </div>}
    </div>
  );
}
