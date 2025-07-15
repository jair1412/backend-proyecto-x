const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
// conección a mongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Conectado a MongoDB"))
.catch(err => console.error("❌ Error al conectar a MongoDB:", err));

// Definición del esquema y modelo
const codigoSchema = new mongoose.Schema({
  codigo: String,
  numeros: [Number],
  correo: String,
  confirmado: { type: Boolean, default: false }
});

const Codigo = mongoose.model("Codigo", codigoSchema);


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Usuarios predefinidos con tipo
const usuarios = [
  { usuario: "jair", clave: "abcd", tipo: "yo" },
  { usuario: "admin", clave: "1412", tipo: "otros" }
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

app.get('/', (req, res) => {
  res.send('Backend funcionando');
});

// Ruta para guardar nuevo código con números y correo
app.post("/guardar-codigo", async (req, res) => {
  const { codigo, numeros, correo } = req.body;
  try {
    // Crea y guarda un nuevo documento en MongoDB
    const nuevoCodigo = new Codigo({ codigo, numeros, correo });
    await nuevoCodigo.save();
    res.json({ mensaje: "Código guardado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error guardando el código" });
  }
});

// Ruta para confirmar código y (opcional) enviar correo
app.post("/confirmar-codigo", async (req, res) => {
  const { codigo } = req.body;
  try {
    const codigoDoc = await Codigo.findOne({ codigo });
    if (!codigoDoc) {
      return res.status(404).json({ error: "Código no encontrado" });
    }
    if (codigoDoc.confirmado) {
      return res.status(400).json({ error: "Código ya confirmado" });
    }

    // Cambia el estado a confirmado
    codigoDoc.confirmado = true;
    await codigoDoc.save();

    // Aquí se puede agregar el envío de correo, ejemplo abajo

    res.json({ mensaje: "Código confirmado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error confirmando el código" });
  }
});

// Ruta para obtener progreso total de números vendidos
app.get("/progreso", async (req, res) => {
  try {
    const codigosConfirmados = await Codigo.find({ confirmado: true });
    const totalNumeros = codigosConfirmados.reduce((acc, c) => acc + c.numeros.length, 0);
    res.json({ totalNumeros });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo progreso" });
  }
});


app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
