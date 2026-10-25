type ConexaoQR={estado:string;qr:string|null;erro:string|null};
export type PedidoQR={inicio:number;erroInicial:string|null};
export function estadoQR(conta:ConexaoQR,pedido:PedidoQR|null,agora:number){
 if(conta.estado==='conectada')return 'conectada';
 if(conta.qr?.startsWith('data:image/png;base64,'))return 'qr';
 if(pedido&&conta.erro&&conta.erro!==pedido.erroInicial)return 'falha';
 if(pedido&&agora-pedido.inicio>=90_000)return 'demorado';
 if(pedido||['conectando','aguardando_qr'].includes(conta.estado))return 'preparando';
 return 'ocioso';
}
