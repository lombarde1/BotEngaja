// src/middlewares/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'sua-chave-secreta-aqui'; // A mesma chave usada no authController!

module.exports = (req, res, next) => {
 // console.log('=== Debug Auth Middleware ===');
  const authHeader = req.headers.authorization;
 // console.log('Authorization Header:', authHeader);

  if (!authHeader) {
    console.log('Erro: Token não fornecido');
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const parts = authHeader.split(' ');
  //console.log('Parts do token:', parts);

  if (parts.length !== 2) {
    console.log('Erro: Token mal formatado (parts length)');
    return res.status(401).json({ error: 'Token error' });
  }

  const [ scheme, token ] = parts;
  //console.log('Scheme:', scheme);
 // console.log('Token:', token);

  if (!/^Bearer$/i.test(scheme)) {
    console.log('Erro: Token mal formatado (Bearer test)');
    return res.status(401).json({ error: 'Token malformatado' });
  }

 // console.log('JWT_SECRET usado para verificação:', JWT_SECRET);
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('Erro na verificação do token:', err);
      return res.status(401).json({ error: 'Token inválido', details: err.message });
    }

  //  console.log('Token decodificado com sucesso:', decoded);
    req.userId = decoded.id;
    return next();
  });
};