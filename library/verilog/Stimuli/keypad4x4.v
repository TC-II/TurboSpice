// Teclado matricial 4×4 (filas 1 2 3 A / 4 5 6 B / 7 8 9 C / * 0 # D): el circuito barre las filas
// R1–R4 (activas en bajo) y lee las columnas C1–C4, que están en 1 (el pull-up) salvo la de la tecla
// apretada cuando su fila está en 0. Aprieta las teclas de KEYS en orden: la primera en T_FIRST µs,
// cada una T_HOLD µs, con T_GAP µs entre una y otra. KEYS se cambia en el código (es un texto).
`timescale 1us/1ns
module keypad4x4 #(parameter T_FIRST = 1000, parameter T_HOLD = 20000, parameter T_GAP = 20000)
                  (input R1, input R2, input R3, input R4, output C1, output C2, output C3, output C4);
  parameter [8*16-1:0] KEYS = "147#";
  // la tecla apretada: fila y columna (0–3), o fila 4 si no hay ninguna
  reg [2:0] r = 4;
  reg [1:0] c = 0;
  wire [3:0] row = {R4, R3, R2, R1};
  wire low = r < 4 && !row[r];
  assign {C4, C3, C2, C1} = low ? ~(4'b1 << c) : 4'b1111;
  integer i;
  reg [7:0] ch;
  initial begin
    #(T_FIRST);
    for (i = 15; i >= 0; i = i - 1) begin
      ch = KEYS[8 * i +: 8];
      if (ch != 0) begin
        case (ch)
          "1": {r, c} = {3'd0, 2'd0}; "2": {r, c} = {3'd0, 2'd1}; "3": {r, c} = {3'd0, 2'd2}; "A": {r, c} = {3'd0, 2'd3};
          "4": {r, c} = {3'd1, 2'd0}; "5": {r, c} = {3'd1, 2'd1}; "6": {r, c} = {3'd1, 2'd2}; "B": {r, c} = {3'd1, 2'd3};
          "7": {r, c} = {3'd2, 2'd0}; "8": {r, c} = {3'd2, 2'd1}; "9": {r, c} = {3'd2, 2'd2}; "C": {r, c} = {3'd2, 2'd3};
          "*": {r, c} = {3'd3, 2'd0}; "0": {r, c} = {3'd3, 2'd1}; "#": {r, c} = {3'd3, 2'd2}; "D": {r, c} = {3'd3, 2'd3};
          default: r = 4;
        endcase
        #(T_HOLD) r = 4;
        #(T_GAP);
      end
    end
  end
endmodule
