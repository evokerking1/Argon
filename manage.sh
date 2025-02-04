#!/bin/bash

set -e

echo "The actual management system of this script is currently broken."
if [ "$ARGON_SETUP" == "1" ]; then
    echo Yay
else
    echo "Argon doesn't seem to be setup on this device.  Like to continue? yes if yes"
    read setup_input

    if [ "$setup_input" = yes ]; then
        #git clone https://github.com/ArgonFOSS/Argon.git

        curl -fsSL https://bun.sh/install | bash
        source ~/.bashrc

        #cd argon-core
        #bun i
        #cd ..

        #cd argon-ui
        #bun i
        #cd ..

        echo "Choose an option to install:"
        echo "1. Install Argon and Daemon (BROKEN AT THE MOMENT SORRY)"
        echo "2. Install Argon"
        echo "3. Install Daemon"

        read choice

        case $choice in

        1)
            git clone https://github.com/ArgonFOSS/Argon
            cd Argon

            cd argon-core
            bun install
            cd ..

            cd argon-ui
            bun install
            cd ..

            cd krypton
            bun install
            cd ..

            export ARGON_SETUP=1

            ;;

        2)
            git clone https://github.com/ArgonFOSS/argon-core

            cd argon-core
            bun install
            cd ..

            git clone https://github.com/ArgonFOSS/argon-ui
            cd argon-ui
            bun install
            cd ..

            export ARGON_SETUP=1
            ;;

        \
            3)
            git clone https://github.com/ArgonFOSS/krypton
            cd krypton
            bun install
            cd ..
            export ARGON_SETUP=1
            ;;

        *)
            echo "Invalid option"
            ;;
        esac

    else
        exit 1

    fi

fi
