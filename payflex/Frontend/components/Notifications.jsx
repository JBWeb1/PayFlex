import { useEffect } from "react";
import { io } from "socket.io-client";

export default function Notifications() {
  useEffect(() => {
    const socket = io("http://localhost:5000");
    socket.on("paymentUpdate", data => {
      alert(`✅ Payment ${data.id} marked as ${data.status}`);
    });

    return () => socket.disconnect();
  }, []);

  return null;
}
