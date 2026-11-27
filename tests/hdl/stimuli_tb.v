// Los estímulos de library/verilog/Stimuli: el pulsador rebota y se asienta; barriendo las filas
// del teclado se leen las teclas de KEYS en orden. Corre con tests/hdl/testbenches.mjs.
`timescale 1us/1ns
module stimuli_tb;
  integer errores = 0;

  // --- pulsador: se aprieta en 10 µs (rebota unos 2 µs) y se suelta en 110 µs ---
  wire y;
  button #(.T_PRESS(10), .T_HOLD(100), .T_BOUNCE(2), .N_BOUNCE(4)) b (.y(y));
  integer flancos = 0;
  realtime ultimo = 0;
  always @(y) if ($realtime > 9) begin flancos = flancos + 1; if ($realtime < 50) ultimo = $realtime; end

  // --- teclado: se barren las filas (una en 0 por vez, 1 µs cada una) ---
  reg [3:0] row = 4'b1111;
  wire [3:0] col;
  keypad4x4 #(.T_FIRST(10), .T_HOLD(50), .T_GAP(50)) kp (.R1(row[0]), .R2(row[1]), .R3(row[2]), .R4(row[3]),
                                                          .C1(col[0]), .C2(col[1]), .C3(col[2]), .C4(col[3]));
  reg [8*16-1:0] leidas = 0;
  reg [7:0] ultima = 0;
  reg [7:0] tecla;
  integer f, c;
  function [7:0] nombre(input integer f, input integer c);
    nombre = "123A456B789C*0#D" >> (8 * (15 - (4 * f + c)));
  endfunction
  // (por barrido de las cuatro filas, la tecla que hubo; se anota cuando cambia a una tecla)
  initial
    forever begin
      tecla = 0;
      for (f = 0; f < 4; f = f + 1) begin
        row = ~(4'b1 << f);
        #1;
        for (c = 0; c < 4; c = c + 1) if (!col[c]) tecla = nombre(f, c);
      end
      if (tecla && tecla != ultima) leidas = {leidas[8*15-1:0], tecla};
      ultima = tecla;
    end

  initial begin
    if (y !== 1) begin $display("FAIL pulsador en reposo: %b", y); errores = errores + 1; end
    #50;
    if (y !== 0) begin $display("FAIL pulsador apretado: %b", y); errores = errores + 1; end
    if (flancos < 5) begin $display("FAIL el pulsador no rebota: %0d flancos", flancos); errores = errores + 1; end
    if (ultimo > 10 + 1.5 * 2) begin $display("FAIL el rebote dura %0.2f us (T_BOUNCE = 2)", ultimo - 10); errores = errores + 1; end
    #150;
    if (y !== 1) begin $display("FAIL pulsador suelto: %b", y); errores = errores + 1; end
    #300;
    if (leidas !== "147#") begin $display("FAIL teclado: leído \"%0s\"", leidas); errores = errores + 1; end
    if (errores) $fatal(1, "FAIL: %0d errores", errores);
    $display("PASS");
    $finish;
  end
endmodule
