const db = require("../db/pool");
const { encrypt, decrypt } = require("../encryption/encryption");
const { validationResult } = require("express-validator");

const sensitiveColumns = ["delivery_address", "payment_method"];

function encryptSensitiveData(data) {
  console.log("In encryptSensitiveData:", data); // Comentar console log
  return sensitiveColumns.reduce((acc, column) => {
    if (data[column]) {
      acc[column] = encrypt(data[column]);
    }
    return acc;
  }, {});
}

function decryptSensitiveData(data) {
  console.log("In decryptSensitiveData:", data); // Comentar console log
  return sensitiveColumns.reduce((acc, column) => {
    if (data[column]) {
      acc[column] = decrypt(data[column]);
    }
    return acc;
  }, {});
}

// getOrders (GET)
exports.getOrders = async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM orders");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// getOrderById (GET)
exports.getOrderById = async (req, res) => {
  const order_id = parseInt(req.params.order_id, 10);

  try {
    const { rows } = await db.query(
      "SELECT * FROM orders WHERE order_id = $1",
      [order_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createOrder = async (req, res) => {
  console.log("In createOrder:", req.body); // Comentar console Log
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    user_id,
    visit_date,
    rental_date,
    visit_date_txt,
    rental_date_txt,
    total_price,
    status_order,
    return_date,
    return_condition,
    delivery_address,
    payment_method,
  } = req.body;

  const encryptedData = encryptSensitiveData({
    delivery_address,
    payment_method,
  });

  const query = `INSERT INTO orders (user_id, visit_date, rental_date, visit_date_txt, rental_date_txt, total_price, status_order, return_date, return_condition, delivery_address, payment_method)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
  const values = [
    user_id,
    visit_date,
    rental_date,
    visit_date_txt,
    rental_date_txt,
    total_price,
    status_order,
    return_date,
    return_condition,
    encryptedData.delivery_address,
    encryptedData.payment_method,
  ];

  try {
    console.log("Executing createOrder query:", query, values); // Comentar Console log
    const result = await db.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error in createOrder:", error); // Comentar console log
    res.status(500).json({ error: "Error al crear la orden" });
  }
};

exports.deleteOrder = async (req, res) => {
  const { order_id } = req.params;

  try {
    // Inicia la transacción
    await db.query("BEGIN");

    // Elimina los detalles de la orden asociados con la orden
    await db.query("DELETE FROM order_details WHERE order_id = $1", [order_id]);

    // Elimina la orden
    await db.query("DELETE FROM orders WHERE order_id = $1", [order_id]);

    // Confirma la transacción
    await db.query("COMMIT");

    res.status(200).json({ message: "Orden eliminada correctamente" });
  } catch (error) {
    console.error(error);

    // Si hay algún error, revierte la transacción
    await db.query("ROLLBACK");

    res.status(500).json({ message: "Error al eliminar la orden" });
  }
};


exports.getOrdersByAdmin = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener las órdenes" });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { order_id } = req.params;
  const { order_status } = req.body;

  try {
    console.log("Executing updateOrderStatus query:", order_status, order_id); // Agregar registro de depuración
    await db.query("UPDATE orders SET order_status = $1 WHERE order_id = $2", [
      order_status,
      order_id,
    ]);
    res
      .status(200)
      .json({ message: "Estado de la orden actualizado correctamente" });
  } catch (error) {
    console.error("Error in updateOrderStatus:", error); // Agregar registro de depuración
    res
      .status(500)
      .json({ message: "Error al actualizar el estado de la orden" });
  }
};

exports.updateOrder = async (req, res) => {
  const { order_id } = req.params;
  const { visit_date, rental_date, visit_date_txt, rental_date_txt } = req.body;

  try {
    console.log(
      "Executing updateOrder query:",
      visit_date,
      rental_date,
      visit_date_txt,
      rental_date_txt,
      order_id
    ); // Agregar registro de depuración
    const result = await db.query(
      "UPDATE orders SET visit_date = $1, rental_date = $2, visit_date_txt = $3, rental_date_txt = $4 WHERE order_id = $5 RETURNING *",
      [visit_date, rental_date, visit_date_txt, rental_date_txt, order_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = result.rows[0];

    // Desencriptar la información sensible antes de enviarla al cliente
    const decryptedData = decryptSensitiveData(order);
    const responseOrder = { ...order, ...decryptedData };

    res.status(200).json(responseOrder);
  } catch (error) {
    console.error("Error in updateOrder:", error); // Agregar registro de depuración
    res.status(500).json({ error: "Error al actualizar la orden" });
  }
};


exports.createOrderDetails = async (order_id, orderDetails) => {
  const query = `INSERT INTO order_details (order_id, item_id, quantity, price)
                 VALUES ($1, $2, $3, $4)`;

  for (const detail of orderDetails) {
    const values = [order_id, detail.item_id, detail.quantity, detail.price];
    try {
      await db.query(query, values);
    } catch (error) {
      console.error('Error in createOrderDetails:', error);
      throw error;
    }
  }
};


// getOrdersByUser (GET)
exports.getOrdersByUser = async (req, res) => {
  const user_id = parseInt(req.params.user_id, 10);

  try {
    const { rows } = await db.query(
      "SELECT * FROM orders WHERE user_id = $1",
      [user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found for the specified user",
      });
    }

    // Desencriptar la información sensible antes de enviarla al cliente
    const decryptedOrders = rows.map((order) => {
      const decryptedData = decryptSensitiveData(order);
      return { ...order, ...decryptedData };
    });

    res.json(decryptedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
