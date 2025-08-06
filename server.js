require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const app = express();
const LIMITE_TOTAL = 150;    // números totales a vender
const PORT = process.env.PORT || 3000;

// CORS - permitir origen de GitHub Pages
app.use(cors({
  origin: [
    'https://jairtc14.github.io',
    'https://sortechweb.com',
    'https://www.sortechweb.com'
  ]
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
  numeros: [Number], // números enteros 1 al 150
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
    const total = LIMITE_TOTAL;      // Total de números 
    const confirmados = await Confirmacion.find({ confirmado: true });
    const vendidos = confirmados.reduce((acc, c) => acc + c.numeros.length, 0);
    
    res.json({ vendidos, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo progreso" });
  }
});

// Ruta para mostrar todos los numeros en tabla y contadores vendidos-faltantes
app.get('/todos-los-numeros', async (req, res) => {
  try {
    const confirmados = await Confirmacion.find({ confirmado: true });
    const todosNumeros = confirmados.flatMap(c => c.numeros);
    const numerosUnicos = [...new Set(todosNumeros)].sort((a, b) => a - b);

    const totalVendidos = numerosUnicos.length;
    const totalRestantes = LIMITE_TOTAL - totalVendidos;

    res.json({
      numeros: numerosUnicos,
      totalVendidos,
      totalRestantes
    });
  } catch (error) {
    console.error('Error al obtener todos los números:', error);
    res.status(500).json({ mensaje: 'Error al obtener los números.' });
  }
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
if (usados.size + cantidadNumeros > LIMITE_TOTAL) {
  return res.status(400).json({ error: 'Ya no hay suficientes números disponibles' });
}

    // Generar números del 1 al 150 únicos
const nuevos = new Set();
while (nuevos.size < cantidadNumeros) {
  const n = Math.floor(Math.random() * 150) + 1; // genera entre 1 y 150
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
      confirmado: false, // Se crea como NO confirmado
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
        <h2 style="color: #1e90ff; text-align: center;">¡Gracias por tu compra, ${confirmacion.nombre}!</h2>
        <p><strong>Código:</strong> ${codigo}</p>
        <p><strong>Combo:</strong> ${confirmacion.combo}</p>
        <p><strong>Números asignados:</strong></p>
        <div style="background: #f0f8ff; padding: 10px; border-radius: 8px; font-size: 18px; font-weight: bold; text-align: center;">
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
      numeros: Number(numero) // 👈 numeros enteros 1-150
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


// Endpoint para formulario de contacto
app.post('/contacto', async (req, res) => {
  try {
    const { nombre, correo, mensaje } = req.body;

    // Validación básica
    if (!nombre || !correo || !mensaje) {
      return res.status(400).json({ 
        enviado: false, 
        mensaje: "Todos los campos son obligatorios" 
      });
    }

    // ⚙️ Usar el mismo transporter que ya tienes
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Enviar correo de contacto a TU email
    await transporter.sendMail({
      from: `"Formulario Contacto - Sortech" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // ← Tu email donde recibirás los mensajes
      subject: `📧 Nuevo mensaje de contacto de ${nombre}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 0; margin: 0; background: #ffffff;">
          
          <!-- Encabezado -->
          <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
            <img src="https://Jairtc14.github.io/Proyecto-X-1.1/img/logo-sortech.png" alt="Logo Sortech" style="height: 60px;" />
            <h2 style="color: #ffffff; margin: 10px 0 0 0;">Nuevo Mensaje de Contacto</h2>
          </div>
          
          <!-- Contenido principal -->
          <div style="padding: 20px;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <h3 style="color: #1e90ff; margin-top: 0;">Información del Contacto:</h3>
              <p><strong>👤 Nombre:</strong> ${nombre}</p>
              <p><strong>📧 Email:</strong> ${correo}</p>
            </div>
            
            <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; border-left: 4px solid #1e90ff;">
              <h3 style="color: #333; margin-top: 0;">💬 Mensaje:</h3>
              <p style="line-height: 1.6; white-space: pre-wrap;">${mensaje}</p>
            </div>
            
            <div style="margin-top: 20px; padding: 10px; background: #e8f5e8; border-radius: 5px;">
              <small style="color: #666;">
                📅 Recibido el: ${new Date().toLocaleString('es-ES')}
              </small>
            </div>
          </div>
          
          <!-- Pie de página -->
          <div style="padding: 10px 20px; text-align: center; font-size: 12px; color: #999; background: #f8f9fa;">
            Este correo fue enviado automáticamente desde el formulario de contacto de Sortech.
          </div>
        </div>
      `
    });

    // OPCIONAL: Enviar correo de confirmación al usuario
    await transporter.sendMail({
      from: `"Sortech" <${process.env.EMAIL_USER}>`,
      to: correo,
      subject: "✅ Hemos recibido tu mensaje - Sortech",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 0; margin: 0; background: #ffffff;">
          
          <!-- Encabezado -->
          <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
            <img src="https://Jairtc14.github.io/Proyecto-X-1.1/img/logo-sortech.png" alt="Logo Sortech" style="height: 60px;" />
          </div>
          
          <!-- Contenido principal -->
          <div style="padding: 20px;">
            <h2 style="color: #1e90ff;">¡Gracias por contactarnos, ${nombre}!</h2>
            <p>Hemos recibido tu mensaje y te responderemos lo antes posible.</p>
            
            <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">📋 Resumen de tu mensaje:</h3>
              <p><strong>Asunto:</strong> Consulta general</p>
              <p><strong>Mensaje:</strong></p>
              <div style="background: #fff; padding: 10px; border-radius: 5px; border-left: 3px solid #1e90ff;">
                ${mensaje.substring(0, 150)}${mensaje.length > 150 ? '...' : ''}
              </div>
            </div>
            
            <p>⏰ <strong>Tiempo de respuesta:</strong> Normalmente respondemos en 24-48 horas.</p>
            <p>Si tu consulta es urgente, también puedes contactarnos por otros medios.</p>
          </div>
          
          <!-- Pie de página -->
          <div style="padding: 10px 20px; text-align: center; font-size: 12px; color: #999;">
            Este correo fue enviado automáticamente por el sistema Sortech.
          </div>
        </div>
      `
    });

    // Respuesta exitosa
    res.json({
      enviado: true,
      mensaje: "Tu mensaje ha sido enviado correctamente. Te responderemos pronto.",
      nombre: nombre
    });

  } catch (error) {
    console.error("Error enviando correo de contacto:", error);
    res.status(500).json({ 
      enviado: false, 
      mensaje: "Error al enviar el mensaje. Por favor, inténtalo de nuevo." 
    });
  }
});

// Ruta para acceso a metodo de pago "efectivo"
//app.post('/verificar-codigo', (req, res) => {
    //const { codigo } = req.body;
    //const adminCode = process.env.ADMIN_CODE;

    //if (codigo === adminCode) {
      //  res.json({ valido: true });
    //} else {
     //   res.json({ valido: false });
   // }
//});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});



