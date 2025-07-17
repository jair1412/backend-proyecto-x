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

//guardar datos de confirmación
const confirmacionSchema = new mongoose.Schema({
  nombre: String,
  telefono: String,
  ciudad: String,
  combo: Number,
  codigo: String,
  fecha: { type: Date, default: Date.now }
});

const Confirmacion = mongoose.model('Confirmacion', confirmacionSchema);


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

// Función para generar números únicos no repetidos
async function generarNumerosAleatorios(cantidad) {
  const usados = new Set();

  const codigosExistentes = await Codigo.find({});
  codigosExistentes.forEach(c => c.numeros.forEach(n => usados.add(n)));

  const disponibles = [];
  for (let i = 0; i <= 999; i++) {
    if (!usados.has(i)) {
      disponibles.push(i);
    }
  }

  if (disponibles.length < cantidad) {
    throw new Error("No hay suficientes números disponibles");
  }

  const resultado = [];
  for (let i = 0; i < cantidad; i++) {
    const idx = Math.floor(Math.random() * disponibles.length);
    resultado.push(disponibles.splice(idx, 1)[0]);
  }

  return resultado.sort((a, b) => a - b);
}

// Ruta mejorada: guarda código con generación de números
app.post("/guardar-codigo", async (req, res) => {
  const { codigo, combo, correo } = req.body;

// Validación del correo
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
  if (!correoValido) {
    return res.status(400).json({ mensaje: "Correo inválido" });
  }

  // Validación de formato del código: debe empezar con PX y tener 6 dígitos (PX123456)
if (!/^PX\d{6}$/.test(codigo)) {
  return res.status(400).json({ mensaje: "Código inválido. Debe tener el formato PX123456." });
}

// Validación de código duplicado
  const existente = await Codigo.findOne({ codigo });
  if (existente) {
    return res.status(400).json({ mensaje: "Este código ya ha sido registrado." });
  }
  
  const cantidad = parseInt(combo);
  if (isNaN(cantidad) || cantidad <= 0 || cantidad > 999) {
    return res.status(400).json({ mensaje: "Combo inválido" });
  }

  try {
    const numeros = await generarNumerosAleatorios(cantidad);
    const nuevoCodigo = new Codigo({ codigo, numeros, correo });
    await nuevoCodigo.save();
    res.json({ mensaje: `Código guardado con ${cantidad} números`, numeros });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error guardando el código" });
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

// consultar números por correo
app.get("/consultar-por-correo/:correo", async (req, res) => {
  try {
    const { correo } = req.params;
    const registros = await Codigo.find({ correo });

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

// Guarda datos de confirmación
app.post('/guardar-confirmacion', async (req, res) => {
  const { nombre, telefono, ciudad, combo, codigo } = req.body;

  if (!nombre || !telefono || !ciudad || !combo || !codigo) {
    return res.status(400).json({ error: 'Faltan campos' });
  }

  try {
    const nuevaConfirmacion = new Confirmacion({
      nombre,
      telefono,
      ciudad,
      combo,
      codigo,
      fecha: new Date()
    });

    await nuevaConfirmacion.save();

    res.status(200).json({ mensaje: 'Confirmación guardada correctamente' });
  } catch (err) {
    console.error('Error al guardar confirmación:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});
