require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const app = express();

// CORS - permitir origen de GitHub Pages
app.use(cors({
  origin: 'https://jairtc14.github.io'
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// conección a mongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Conectado a MongoDB"))
.catch(err => console.error("❌ Error al conectar a MongoDB:", err));

//guardar datos de confirmación
const confirmacionSchema = new mongoose.Schema({
  nombre: String,
  telefono: String,
  ciudad: String,
  combo: Number,
  codigo: String,
  correo: String,
  numeros: [String], // números como strings de 3 cifras (ej: "004")
  confirmado: { type: Boolean, default: false }, // 🆕 NUEVO CAMPO
  fecha: { type: Date, default: Date.now }
});

const Confirmacion = mongoose.model('Confirmacion', confirmacionSchema);

// Usuarios predefinidos con tipo usando variables de entorno
const usuarios = [
  {
    usuario: process.env.ADMIN1_USER,
    clave: process.env.ADMIN1_PASS,
    tipo: process.env.ADMIN1_TYPE
  },
  {
    usuario: process.env.ADMIN2_USER,
    clave: process.env.ADMIN2_PASS,
    tipo: process.env.ADMIN2_TYPE
  }
];

// Ruta para login
app.post("/login", (req, res) => {
  const { usuario, clave } = req.body;
  const encontrado = usuarios.find(
    u => u.usuario === usuario && u.clave === clave
  );

  if (encontrado) {
    res.json({ 
      acceso: true, 
      mensaje: "Bienvenido administrador",
      tipo: encontrado.tipo
    });
  } else {
    res.status(401).json({ acceso: false, mensaje: "Credenciales incorrectas" });
  }
});

// 🔄 MODIFICADO: Ruta para obtener progreso SOLO de números confirmados
app.get("/progreso", async (req, res) => {
  try {
    // Solo contar códigos que han sido confirmados
    const confirmados = await Confirmacion.find({ confirmado: true });
    const totalNumeros = confirmados.reduce((acc, c) => acc + c.numeros.length, 0);
    res.json({ totalNumeros });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo progreso" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});

// consultar números por correo
app.get("/consultar-por-correo/:correo", async (req, res) => {
  try {
    const { correo } = req.params;
    const registros = await Confirmacion.find({ correo });

    if (!registros || registros.length === 0) {
      return res.status(404).json({ error: "Correo no encontrado" });
    }

    // Mapeamos los registros para devolver solo lo necesario
    const resultado = registros.map(r => ({
      codigo: r.codigo,
      numeros: r.numeros
    }));

    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en la consulta" });
  }
});

app.post('/guardar-confirmacion', async (req, res) => {
  const { nombre, telefono, ciudad, combo, codigo, correo } = req.body;

  if (!nombre || !telefono || !ciudad || !combo || !codigo || !correo) {
    return res.status(400).json({ error: 'Faltan campos' });
  }

  try {
    // 🔄 MODIFICADO: Solo contar números de códigos confirmados para la validación
    const confirmados = await Confirmacion.find({ confirmado: true });
    const usados = new Set(confirmados.flatMap(c => c.numeros || []));

    const cantidadNumeros = parseInt(combo);
    if (isNaN(cantidadNumeros) || cantidadNumeros <= 0) {
      return res.status(400).json({ error: 'Combo inválido' });
    }

    // Verifica que haya suficientes números
    if (usados.size + cantidadNumeros > 1000) {
      return res.status(400).json({ error: "Ya no hay suficientes números disponibles" });
    }

    // Generar números de 3 cifras únicos
    const nuevos = new Set();
    while (nuevos.size < cantidadNumeros) {
      const n = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
      if (!usados.has(n)) {
        nuevos.add(n);
        usados.add(n);
      }
    }

    const nuevaConfirmacion = new Confirmacion({
      nombre,
      telefono,
      ciudad,
      combo,
      codigo,
      correo,
      numeros: Array.from(nuevos),
      confirmado: false, // 🆕 Se crea como NO confirmado
      fecha: new Date()
    });

    await nuevaConfirmacion.save();

    res.status(200).json({
      mensaje: 'Confirmación guardada con números únicos',
      numeros: nuevaConfirmacion.numeros
    });
  } catch (err) {
    console.error('Error al guardar confirmación:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Verificar código en la colección 'confirmacions'
app.get('/verificar-codigo/:codigo', async (req, res) => {
  const { codigo } = req.params;

  try {
    const resultado = await Confirmacion.findOne({ codigo });

    if (!resultado) {
      return res.status(404).json({ mensaje: 'Código no encontrado' });
    }

    res.json({
      nombre: resultado.nombre,
      combo: resultado.combo,
      telefono: resultado.telefono
    });
  } catch (error) {
    console.error('Error al verificar código:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
});

// ✅ Ruta ligera para solo verificar si un código ya existe
app.get('/codigo-existe/:codigo', async (req, res) => {
  const { codigo } = req.params;

  try {
    const existe = await Confirmacion.exists({ codigo });
    res.json({ existe: !!existe });
  } catch (error) {
    console.error('Error al verificar si el código existe:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
});

//ENVIAR NÚMEROS AL CORREO
const nodemailer = require("nodemailer");

// 🔄 MODIFICADO: Marcar como confirmado al enviar números
app.post("/enviar-numeros", async (req, res) => {
  const { codigo } = req.body;

  try {
    const confirmacion = await Confirmacion.findOne({ codigo });

    if (!confirmacion) {
      return res.status(404).json({ mensaje: "Código no encontrado en confirmacions" });
    }

    // 🆕 MARCAR COMO CONFIRMADO
    await Confirmacion.updateOne(
      { codigo },
      { confirmado: true }
    );

    // ⚙️ Configura tu transporte de correo
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Enviar correo
   await transporter.sendMail({
  from: `"Sortech" <${process.env.EMAIL_USER}>`,
  to: confirmacion.correo,
  subject: "🎉 ¡Aquí están tus números del sorteo!",
  html: `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 0; margin: 0; background: #ffffff;">
      
      <!-- Encabezado -->
      <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
        <img src="https://Jairtc14.github.io/Proyecto-X-1.1/img/logo-sortech.png" alt="Logo Sortech" style="height: 60px;" />
      </div>

      <!-- Contenido principal -->
      <div style="padding: 20px;">
        <h2 style="color: #1e90ff;">¡Gracias por tu compra, ${confirmacion.nombre}!</h2>
        <p><strong>Código:</strong> ${codigo}</p>
        <p><strong>Combo:</strong> ${confirmacion.combo}</p>
        <p><strong>Números asignados:</strong></p>
        <div style="background: #f0f8ff; padding: 10px; border-radius: 8px; font-size: 18px; font-weight: bold;">
          ${confirmacion.numeros.join(", ")}
        </div>
        <p style="margin-top: 20px;">¡Te deseamos mucha suerte en el sorteo!</p>
      </div>

      <!-- Pie de página -->
      <div style="padding: 10px 20px; text-align: center; font-size: 12px; color: #999;">
        Este correo fue enviado automáticamente por el sistema Sortech.
      </div>
    </div>
  `
});

    res.json({
      enviado: true,
      mensaje: "Correo enviado correctamente",
      nombre: confirmacion.nombre,
      telefono: confirmacion.telefono,
      combo: confirmacion.combo
    });
  } catch (error) {
    console.error("Error enviando correo:", error);
    res.status(500).json({ enviado: false, mensaje: "Error al procesar la solicitud" });
  }
});

// buscar numero
app.get("/buscar-por-numero/:numero", async (req, res) => {
  const { numero } = req.params;

  try {
    const documento = await Confirmacion.findOne({
  numeros: numero.padStart(3, "0")
});

    if (!documento) {
      return res.status(404).json({ mensaje: "Número no encontrado" });
    }

    res.json({
      nombre: documento.nombre,
      correo: documento.correo,
      telefono: documento.telefono
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
});
