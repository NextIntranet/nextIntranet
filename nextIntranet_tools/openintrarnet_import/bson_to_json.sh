#!/bin/bash

# Složka, kde se nacházejí BSON soubory
input_folder="/home/roman/Dokumenty/mongodump_20241227/USTintranet"

# Přepnutí do složky s BSON soubory
cd "$input_folder" || exit

# Pro všechny BSON soubory ve složce
for bson_file in *.bson; do
    # Jméno výstupního JSON souboru
    json_file="${bson_file%.bson}.json"
    # Spuštění bsondump
    bsondump --outFile="$json_file" "$bson_file"
    echo "Processed $bson_file -> $json_file"
done