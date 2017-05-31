# spdz-scratchpad
Personal programs to experiment with SPDZ

## Running SPDZ programs from separate directory

Create Player-Data and SPDZ Keys with docker containers. Run docker spdzdev mounting dir containing Programs and Player-Data.

```
docker run -it --rm -p 14000-14010:14000-14010 -v ${HOME}/Development/spdz:/spdz -v ${HOME}/Development/spdz-scratchpad:/spdz/scratchpad spdz/spdzdev
```

Then to compile / run mpc program from mounted scratchpad directory:

```
cd scratchpad
../spdz/compile.py my.mpc
../spdz/Scripts/run-online my
```