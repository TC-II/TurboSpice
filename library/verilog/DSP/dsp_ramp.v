// Rampa (#366): en cada flanco suma STEP (con signo) y envuelve: un diente de sierra de período
// 2^W / |STEP| ciclos. Arranca en START.
module dsp_ramp #(parameter W = 16, parameter STEP = 256, parameter START = 0) (
  input clk,
  output reg signed [W-1:0] y
);
  initial y = START;
  always @(posedge clk) y <= y + STEP;
endmodule
