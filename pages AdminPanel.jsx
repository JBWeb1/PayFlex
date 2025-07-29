import { useEffect, useState } from "react";
import API from "../api";

export default function AdminPanel() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchPayments = async () => {
      const res = await API.get('/admin/payments');
      setData(res.data);
    };
    fetchPayments();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl mb-4">Admin Panel</h2>
      <table className="w-full border">
        <thead>
          <tr>
            <th>User</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.map(tx => (
            <tr key={tx._id}>
              <td>{tx.userId?.email}</td>
              <td>R {tx.amount}</td>
              <td>{tx.status}</td>
              <td>{new Date(tx.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
