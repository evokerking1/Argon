#!/bin/bash

echo "Enter a number between 1 and 3:"
read number

if [ "$number" -eq 1 ]; then
    echo "You entered one."
elif [ "$number" -eq 2 ]; then
    echo "You entered two."
elif [ "$number" -eq 3 ]; then
    echo "You entered three."
else
    echo "Invalid input. Please enter a number between 1 and 3."
fi
