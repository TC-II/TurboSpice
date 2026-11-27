import { describe, expect, it } from 'vitest';
import { stateNames, verilogNumber } from '../../src/hdl/states.ts';

const FSM = `module puerta #(parameter N = 4) (input clk, input rst, input boton, output reg abierta);
  // estados
  localparam [1:0] CERRADA = 2'd0, ABRE = 2'b01, // comentario
                   ABIERTA = 2'h2, CIERRA = 3;
  localparam T = 10; // una sola constante: no es un grupo de estados
  reg [1:0] estado, prox;
  always @(posedge clk) if (rst) estado <= CERRADA; else estado <= prox;
  always @* begin
    prox = estado;
    case (estado)
      CERRADA: if (boton) prox = ABRE;
      ABRE: prox = ABIERTA;
      default: prox = CERRADA;
    endcase
  end
endmodule`;

describe('nombres de estado', () => {
  it('constantes de Verilog', () => {
    expect([verilogNumber('5'), verilogNumber("2'd1"), verilogNumber("3'b101"), verilogNumber("8'hA5"), verilogNumber("'h1F"), verilogNumber('1_000')]).toEqual([5, 1, 5, 165, 31, 1000]);
    expect(verilogNumber('N-1')).toBeUndefined();
  });
  it('un grupo de localparam: los estados de las señales que los reciben', () => {
    const s = stateNames([FSM]);
    expect([...s.keys()].sort()).toEqual(['estado', 'prox']);
    expect([...s.get('estado')!]).toEqual([
      [0, 'CERRADA'],
      [1, 'ABRE'],
      [2, 'ABIERTA'],
      [3, 'CIERRA'],
    ]);
  });
  it('sin grupos (parameter del encabezado, una sola constante): nada', () => {
    expect(stateNames(['module m #(parameter N = 4) (input a); localparam T = 2; reg r; always @* r = T; endmodule']).size).toBe(0);
  });
});
