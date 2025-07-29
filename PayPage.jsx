import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import io from "socket.io-client";

const socket = io("http://localhost:5000"); // Change to your backend URL

const PayPage = () => {
  const { paymentId } = useParams();
  const [payment, setPayment] = useState(null);
  const [status, setStatus] = useState("Fetching...");

  useEffect(() => {
    // Get payment details
    const fetchPayment = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/payment/${paymentId}`);
        setPayment(res.data);
        setStatus(res.data.status);
      } catch (err) {
        console.error(err);
        setStatus("Error loading payment");
      }
    };

    fetchPayment();

    // Listen for status updates
    socket.on(`payment-update-${paymentId}`, (newStatus) => {
      setStatus(newStatus);
    });

    return () => {
      socket.off(`payment-update-${paymentId}`);
    };
  }, [paymentId]);

  if (!payment) {
    return <div className="text-center mt-10 text-lg">Loading payment...</div>;
  }

  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white shadow-xl rounded-xl border border-gray-100">
      <h2 className="text-2xl font-bold text-center mb-4 text-green-700">Pay with QR</h2>
      <div className="mb-4">
        <p><strong>Amount:</strong> R{payment.amount}</p>
        <p><strong>Reference:</strong> {payment.reference}</p>
        <p><strong>To:</strong> {payment.receiver}</p>
      </div>

      <div className="flex justify-center">
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?data=${payment.qrData}&size=200x200`}
          alt="Payment QR"
          className="border rounded-lg"
        />
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600">Scan the QR with your banking app to pay.</p>
        <p className="mt-2 text-lg font-semibold text-blue-600">Status: {status}</p>
      </div>
    </div>
  );
};

export default PayPage;
